// items.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { ConnectionPool, IResult } from 'mssql';
import * as sql from 'mssql';

interface FindOptions {
  search?: string;
  category?: string;
  sort?: string;
  limit?: number;
}

@Injectable()
export class ItemsService {
  constructor(
    @Inject('MSSQL_SETTINGS_CONNECTION') private readonly dbSettings: ConnectionPool, // TEST

  ) {}

  // items.service.ts
async findAll(options: FindOptions = {}) {
  const { search, category, sort, limit } = options;

  let query = `
  SELECT
    ${limit ? `TOP ${limit}` : ""} 
    si.SellerItemID,
    si.MedicineID,
    si.SellerID,
    si.StockQuantity,
    si.Price,
    si.PriceWas,
    si.IsOutOfStock,
    si.UserViewCount,

    -- Noms
    m.NameEn,
    m.NameAr,

    -- Descriptions (CAST NTEXT → NVARCHAR(MAX))
    MAX(CONVERT(NVARCHAR(MAX), m.Indications))     AS Indications,
    MAX(CONVERT(NVARCHAR(MAX), m.PamphletEn))      AS PamphletEn,
    MAX(CONVERT(NVARCHAR(MAX), m.PamphletAr))      AS PamphletAr,
    MAX(CONVERT(NVARCHAR(MAX), m.PackDescription)) AS PackDescription,
    MAX(CONVERT(NVARCHAR(MAX), m.YoutubeURL))      AS YoutubeURL,

    m.ItemBrandID,
    m.OfficialPrice,
    m.DrugClassificationTypeID,

    -- Photos
    MAX(m.PhotoFileName) AS MedicinePhoto_Main,
    STRING_AGG(mp.PhotoFileName, ',') AS MedicinePhoto_Extra_List,

    -- ⭐ Rating
    ISNULL(AVG(r.Rate), 0) AS AvgRating,
    COUNT(r.Rate)          AS TotalRatings

  FROM dbo.tbl_SellerItems si
  INNER JOIN dbo.lkp_Medicines m  ON si.MedicineID = m.MedicineID
  LEFT JOIN dbo.lkp_MedicinePhotos mp 
         ON si.MedicineID = mp.MedicineID AND mp.IsDeleted = 0
  LEFT JOIN dbo.tbl_OffersComments r 
         ON si.SellerItemID = r.SellerItemID AND r.IsDeleted = 0
  WHERE si.IsDeleted = 0 AND m.IsDeleted = 0
  `;

  const request = this.dbSettings.request();

  if (search) {
    query += ` AND (m.NameEn LIKE @Search OR m.NameAr LIKE @Search)`;
    request.input("Search", sql.NVarChar, `%${search}%`);
  }

  if (category && category !== "All") {
    query += ` AND m.DrugClassificationTypeID = @CategoryID`;
    request.input("CategoryID", sql.Int, Number(category));
  }

  query += `
  GROUP BY 
    si.SellerItemID, si.MedicineID, si.SellerID, si.StockQuantity, si.Price, si.PriceWas,
    si.IsOutOfStock, si.UserViewCount,
    m.NameEn, m.NameAr, m.ItemBrandID, m.OfficialPrice, m.DrugClassificationTypeID
  `;

  if (sort === "PriceAsc")       query += ` ORDER BY CAST(si.Price AS FLOAT) ASC`;
  else if (sort === "PriceDesc") query += ` ORDER BY CAST(si.Price AS FLOAT) DESC`;
  else if (sort === "BestRated") query += ` ORDER BY AvgRating DESC`;
  else                           query += ` ORDER BY si.SellerItemID DESC`;

  const r: IResult<any> = await request.query(query);

  const baseMed = 'https://test.itspark-eg.com/Uploads_emart/medicines_images/';
  const baseProd = 'https://test.itspark-eg.com/Uploads_emart/ProductPhotos/';

  return r.recordset.map(row => {
    const main = row.MedicinePhoto_Main ? baseMed + row.MedicinePhoto_Main : null;
    const extras = row.MedicinePhoto_Extra_List
      ? row.MedicinePhoto_Extra_List.split(',').filter(Boolean).map((f: string) => baseProd + f)
      : [];
    return {
      ...row,
      photoUrl: main ?? extras[0] ?? null,
      imageUrls: [ ...(main ? [main] : []), ...extras ],
    };
  });
}


async findOne(medicineId: number) {
    if (!medicineId) return null;

    const r: IResult<any> = await this.dbSettings
      .request()
      .input('id', sql.Int, medicineId)
      .query(`
        SELECT TOP (1)
          si.SellerItemID, si.MedicineID, si.SellerID, si.StockQuantity,
          si.Price, si.PriceWas, si.IsOutOfStock, si.UserViewCount,
          m.NameEn, m.NameAr,
          MAX(CONVERT(NVARCHAR(MAX), m.Indications)) AS Indications,
          MAX(CONVERT(NVARCHAR(MAX), m.PamphletEn)) AS PamphletEn,
          MAX(CONVERT(NVARCHAR(MAX), m.PamphletAr)) AS PamphletAr,
          MAX(CONVERT(NVARCHAR(MAX), m.PackDescription)) AS PackDescription,
          MAX(CONVERT(NVARCHAR(MAX), m.YoutubeURL)) AS YoutubeURL,
          m.ItemBrandID, m.OfficialPrice,
          MAX(m.PhotoFileName) AS MedicinePhoto_Main,
          STRING_AGG(mp.PhotoFileName, ',') AS MedicinePhoto_Extra_List,
          ISNULL(AVG(r.Rate), 0) AS AvgRating,
          COUNT(r.Rate) AS TotalRatings
        FROM dbo.tbl_SellerItems si
        INNER JOIN dbo.lkp_Medicines m ON si.MedicineID = m.MedicineID
        LEFT JOIN dbo.lkp_MedicinePhotos mp ON si.MedicineID = mp.MedicineID AND mp.IsDeleted = 0
        LEFT JOIN dbo.tbl_OffersComments r ON si.SellerItemID = r.SellerItemID AND r.IsDeleted = 0
        WHERE si.MedicineID = @id AND si.IsDeleted = 0 AND m.IsDeleted = 0
        GROUP BY si.SellerItemID, si.MedicineID, si.SellerID, si.StockQuantity, si.Price, 
                 si.PriceWas, si.IsOutOfStock, si.UserViewCount, m.NameEn, m.NameAr, m.ItemBrandID, m.OfficialPrice
      `);

    return r.recordset[0] ?? null;
  }



  // items.service.ts
async findCategories() {
  const catQ = `
    SELECT DrugClassificationTypeID, NameEn, NameAr, ShowInMenu, ShowInHome, SortOrder
    FROM dbo.lkp_DrugClassificationTypes
    WHERE IsDeleted = 0
    ORDER BY SortOrder`;
  const r = await this.dbSettings.request().query(catQ);
  if (!r.recordset?.length) return [];

  const settingsQ = `
    SELECT ItemName, DisplayName, ItemValue
    FROM dbo.tbl_Settings
    WHERE IsDeleted = 0 AND (ItemName LIKE 'Cat_%' OR DisplayName LIKE 'Cat_%'
         OR ItemName IN ('CategoryImagesFolderDownload','CategoryImagesFolderUpload'))`;
  const s = await this.dbSettings.request().query(settingsQ);

  // ⚠️ Override : on impose Brand_images (DB est fausse)
const BASE_URL = 'https://test.itspark-eg.com/Uploads_emart/Brand_images/';

const buildUrl = (val?: string | null) => {
  if (!val) return null;
  if (/^https?:\/\//i.test(val)) return val.trim();
  const clean = val.trim().replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  return BASE_URL + clean;
};

  const toKey = (v?: string) =>
    (v ?? '').trim().toUpperCase().replace(/\s+/g, '');

  const map = new Map<string, string>();
  for (const row of s.recordset) {
    const k1 = toKey(row.ItemName);
    const k2 = toKey(row.DisplayName);
    if (k1.startsWith('CAT_')) map.set(k1, row.ItemValue?.trim() ?? '');
    if (k2.startsWith('CAT_')) map.set(k2, row.ItemValue?.trim() ?? '');
  }

  

  return r.recordset.map((row: any) => {
    const idStr = String(row.DrugClassificationTypeID).trim();
    const keys = [toKey(`Cat_${idStr}`), toKey(`Cat_${idStr.padStart(5,'0')}`)];
    let val: string | undefined;
    for (const k of keys) if (map.has(k)) { val = map.get(k); break; }

    return {
      id: row.DrugClassificationTypeID,
      nameEn: row.NameEn?.trim() || '',
      nameAr: row.NameAr?.trim() || '',
      showInMenu: !!row.ShowInMenu,
      showInHome: row.ShowInHome != null ? !!row.ShowInHome : false,
      photoUrl: buildUrl(val), // null si pas de mapping
    };
  });
}

async testSettings() {
  try {
    console.log("🚀 [testSettings] Début exécution...");

    const query = `
      SELECT TOP (10) ItemName, DisplayName, ItemValue
      FROM dbo.tbl_Settings
      WHERE isDeleted = 0
    `;

    console.log("📡 [SQL] Query →", query);

    const request = this.dbSettings.request();
    const r = await request.query(query);

    console.log("📦 [SQL Result] →", r.recordset);

    return r.recordset;
  } catch (err) {
    console.error("❌ [testSettings] ERREUR :", err);
    throw err; // renvoie l’erreur à NestJS → 500
  }
}


async getRatings(sellerItemId: number) {
  const request = this.dbSettings.request();
  request.input("SellerItemID", sql.Int, sellerItemId);

  const r = await request.execute("cproc_GetAllratings");

  console.log("📦 Ratings result →", r.recordsets);

  // recordsets[0] → contient les stats par note (1–5)
  // recordsets[1] → contient RecommendThisProduct

  return {
    distribution: r.recordsets[0],  // [{Rate: xx, total: yy}, ...]
    recommend: r.recordsets[1][0]?.RecommendThisProduct ?? 0,
  };
}
async rateProduct(
  sellerItemId: number,
  userId: number,
  rate: number,
  comment?: string,
  recommend: boolean = false
) {
  const request = this.dbSettings.request();
  request.input("SellerItemID", sql.Int, sellerItemId);
  request.input("UserID", sql.Int, userId);
  request.input("Rate", sql.Int, rate);
  request.input("Comment", sql.NVarChar, comment || null);
  request.input("IRecommendThisProduct", sql.Bit, recommend ? 1 : 0);

  await request.query(`
    IF EXISTS (
      SELECT 1 FROM dbo.tbl_OffersComments
      WHERE SellerItemID = @SellerItemID AND UserID = @UserID AND IsDeleted = 0
    )
    BEGIN
      UPDATE dbo.tbl_OffersComments
      SET Rate = @Rate,
          Comment = @Comment,
          IRecommendThisProduct = @IRecommendThisProduct,
          LastDateModified = GETDATE(),
          ModifiedUserID = @UserID
      WHERE SellerItemID = @SellerItemID AND UserID = @UserID AND IsDeleted = 0;
    END
    ELSE
    BEGIN
      INSERT INTO dbo.tbl_OffersComments
        (SellerItemID, UserID, Rate, Comment, IRecommendThisProduct,
         CreationDate, ModifiedUserID, LastDateModified, IsDeleted)
      VALUES
        (@SellerItemID, @UserID, @Rate, @Comment, @IRecommendThisProduct,
         GETDATE(), @UserID, GETDATE(), 0);
    END
  `);

  // Retourne les stats mises à jour
  return this.getRatings(sellerItemId);
}


// Récupère les datasheets liés à un MedicineID
async findDatasheets(medicineId: number) {
  console.log(`[findDatasheets] Called with MedicineID = ${medicineId}`);

  const r: IResult<any> = await this.dbSettings
    .request()
    .input("MedicineID", sql.Int, medicineId)
    .query(`
      SELECT 
        MedicineDatasheetID,
        MedicineID,
        DatasheetFileName,
        DatasheetFileServerName,
        CreationDate
      FROM dbo.lkp_MedicineDatasheets
      WHERE MedicineID = @MedicineID AND IsDeleted = 0
      ORDER BY CreationDate DESC
    `);

  console.log("📦 [findDatasheets] Result →", r.recordset);

  // ✅ URL corrigée
  const baseDatasheetUrl = "https://test.itspark-eg.com/Uploads_emart/ProductDataSheet/";

  return r.recordset.map(row => ({
    id: row.MedicineDatasheetID,
    medicineId: row.MedicineID,
    fileName: row.DatasheetFileName,
    fileUrl: row.DatasheetFileServerName 
      ? baseDatasheetUrl + row.DatasheetFileServerName 
      : null, // fallback si pas de fichier
    createdAt: row.CreationDate,
  }));
}

async findVideos(medicineId: number) {
  console.log(`[findVideos] Called with MedicineID = ${medicineId}`);

  const r: IResult<any> = await this.dbSettings
    .request()
    .input("MedicineID", sql.Int, medicineId)
    .query(`
      SELECT 
        MedicineVideoID,
        MedicineID,
        VideoFileName,
        VideoFileServerName,
        CreationDate
      FROM dbo.lkp_MedicineVideos
      WHERE MedicineID = @MedicineID AND IsDeleted = 0
      ORDER BY CreationDate DESC
    `);

  console.log("📦 [findVideos] Result →", r.recordset);

  const baseVideoUrl = "https://test.itspark-eg.com/Uploads_emart/doctor_Videos/";

  return r.recordset.map(row => {
    // Relation logique entre nom affiché et fichier serveur
    let serverFile = row.VideoFileServerName;
    let displayName = row.VideoFileName;

    // ⚡ Normalise en .mp4 si jamais c’est encore en .wmv
    if (serverFile && serverFile.toLowerCase().endsWith(".wmv")) {
      serverFile = serverFile.replace(/\.wmv$/i, ".mp4");
    }
    if (displayName && displayName.toLowerCase().endsWith(".wmv")) {
      displayName = displayName.replace(/\.wmv$/i, ".mp4");
    }

    return {
      id: row.MedicineVideoID,
      medicineId: row.MedicineID,
      fileName: displayName,
      fileUrl: baseVideoUrl + serverFile,
      createdAt: row.CreationDate,
    };
  });

}

// items.service.ts
async getTopBrandsOrCategories(limit: number = 6) {
  console.log('🚀 [getTopBrandsOrCategories] Called with limit =', limit);

  const request = this.dbSettings.request();

  // Vérifier s'il y a des ventes valides
  const checkQuery = `
    SELECT COUNT(1) AS TotalOrders
    FROM dbo.tbl_OrderItems oi
    INNER JOIN dbo.tbl_Orders o ON oi.OrderID = o.OrderID AND o.IsDeleted = 0
    INNER JOIN dbo.lkp_Medicines m ON oi.MedicineID = m.MedicineID AND m.IsDeleted = 0
    WHERE oi.IsDeleted = 0
  `;
  const checkResult = await request.query(checkQuery);
  const totalOrders = checkResult.recordset[0]?.TotalOrders || 0;
  console.log('📊 Total valid order items:', totalOrders);

  let brands: any[] = [];

  if (totalOrders > 0) {
    // Top brands via commandes
    const topBrandsQuery = `
      SELECT TOP (@Limit)
        b.ItemBrandID, b.NameEn, b.NameAr,
        SUM(oi.Quantity) AS TotalQuantitySold
      FROM dbo.tbl_OrderItems oi
      INNER JOIN dbo.tbl_Orders o ON oi.OrderID = o.OrderID AND o.IsDeleted = 0
      INNER JOIN dbo.lkp_Medicines m ON oi.MedicineID = m.MedicineID AND m.IsDeleted = 0
      INNER JOIN dbo.lkp_ItemBrands b ON m.ItemBrandID = b.ItemBrandID
      WHERE oi.IsDeleted = 0
      GROUP BY b.ItemBrandID, b.NameEn, b.NameAr
      ORDER BY SUM(oi.Quantity) DESC
    `;
    request.input("Limit", sql.Int, limit);
    const topResult = await request.query(topBrandsQuery);
    brands = topResult.recordset;
    console.log('📦 [Top Brands Result] →', brands);
  }

  if (!brands || brands.length === 0) {
    // Fallback: prendre toutes les brands
    console.log('⚠️ No top brands found, fetching all brands...');
    const brandsQuery = `
      SELECT TOP (@Limit) ItemBrandID, NameEn, NameAr
      FROM dbo.lkp_ItemBrands
      WHERE IsDeleted = 0
      ORDER BY NameEn
    `;
    const brandsResult = await this.dbSettings.request()
      .input("Limit", sql.Int, limit)
      .query(brandsQuery);
    brands = brandsResult.recordset;
    console.log('📦 [All Brands Result] →', brands);
  }

  // Ajouter images
  const settingsQuery = `
    SELECT DisplayName, ItemValue
    FROM dbo.tbl_Settings
    WHERE IsDeleted = 0 AND DisplayName LIKE 'Brand_%'
  `;
  const settingsResult: IResult<any> = await this.dbSettings.request().query(settingsQuery);

  const brandsWithImages = brands.map(brand => {
    const imgSetting = settingsResult.recordset.find(s => s.DisplayName === `Brand_${brand.ItemBrandID}`);
    return {
      ...brand,
      photoUrl: imgSetting?.ItemValue ?? null,  // <-- fallback null si pas d'image
    };
  });

  // Fallback final vers catégories si aucun brand trouvé ou image
  if (!brandsWithImages || brandsWithImages.length === 0) {
    console.log('⚠️ No brands with images, fetching categories...');
    return this.findCategories();
  }

  return brandsWithImages;
}

}
