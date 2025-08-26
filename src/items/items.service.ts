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
    @Inject('MSSQL_CONNECTION') private readonly db: ConnectionPool,
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


async findOne(id: number) {
  const r: IResult<any> = await this.dbSettings
    .request()
    .input('id', sql.Int, id)
    .query(`
      SELECT TOP (1)
        si.SellerItemID,
        si.MedicineID,
        si.SellerID,
        si.StockQuantity,
        si.Price,
        si.PriceWas,
        si.IsOutOfStock,
        si.UserViewCount,

        m.NameEn,
        m.NameAr,

        -- Descriptions
        MAX(m.Indications)     AS Indications,
        MAX(m.PamphletEn)      AS PamphletEn,
        MAX(m.PamphletAr)      AS PamphletAr,
        MAX(m.PackDescription) AS PackDescription,
        MAX(m.YoutubeURL)      AS YoutubeURL,

        m.ItemBrandID,
        m.OfficialPrice,

        -- Photos
        MAX(m.PhotoFileName) AS MedicinePhoto_Main,
-- Toutes les photos extra (CSV)
STRING_AGG(mp.PhotoFileName, ',') AS MedicinePhoto_Extra_List,

        -- ⭐ Rating
        ISNULL(AVG(r.Rate), 0) AS AvgRating,
        COUNT(r.Rate)          AS TotalRatings

      FROM dbo.tbl_SellerItems si
      INNER JOIN dbo.lkp_Medicines m ON si.MedicineID = m.MedicineID
      LEFT JOIN dbo.lkp_MedicinePhotos mp
             ON si.MedicineID = mp.MedicineID AND mp.IsDeleted = 0
      LEFT JOIN dbo.tbl_OffersComments r
             ON si.SellerItemID = r.SellerItemID AND r.IsDeleted = 0

      WHERE si.SellerItemID = @id AND si.IsDeleted = 0 AND m.IsDeleted = 0

      GROUP BY 
        si.SellerItemID, si.MedicineID, si.SellerID, si.StockQuantity, si.Price, 
        si.PriceWas, si.IsOutOfStock, si.UserViewCount,
        m.NameEn, m.NameAr, m.ItemBrandID, m.OfficialPrice
    `);

  const item = r.recordset[0];
  if (!item) return null;

  const baseMed = 'https://test.itspark-eg.com/Uploads_emart/medicines_images/';
  const baseProd = 'https://test.itspark-eg.com/Uploads_emart/ProductPhotos/';

  const main = item.MedicinePhoto_Main ? baseMed + item.MedicinePhoto_Main : null;
  const extras = item.MedicinePhoto_Extra_List
    ? item.MedicinePhoto_Extra_List.split(',').filter(Boolean).map((f: string) => baseProd + f)
    : [];

  return {
    ...item,
    photoUrl: main ?? extras[0] ?? null,
    imageUrls: [ ...(main ? [main] : []), ...extras ],
  };
}

  // items.service.ts
async findCategories() {
  const query = `
    SELECT 
      DrugClassificationTypeID,
      NameEn,
      NameAr,
      ShowInMenu,
      ShowInHome,
      SortOrder
    FROM dbo.lkp_DrugClassificationTypes
    WHERE IsDeleted = 0
    ORDER BY SortOrder
  `;

  const r: IResult<any> = await this.db.request().query(query);

  if (!r.recordset || r.recordset.length === 0) {
    return [];
  }

// Maintenant récupérer les images depuis TEST_eCommerce
const settingsQuery = `
  SELECT ItemName, DisplayName, ItemValue
  FROM dbo.tbl_Settings
  WHERE isDeleted = 0
`;
const s: IResult<any> = await this.dbSettings.request().query(settingsQuery);

// On mappe les catégories + image correspondante
return r.recordset.map(row => {
  const img = s.recordset.find(
    (x) => x.DisplayName === `Cat_${row.DrugClassificationTypeID}`
  );

  return {
    id: row.DrugClassificationTypeID,
    nameEn: row.NameEn,
    nameAr: row.NameAr,
    showInMenu: row.ShowInMenu,
    showInHome: row.ShowInHome,
    photoUrl: img ? img.ItemValue : null,  // ✅ ajoute l’URL si trouvée
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
  const query = `
    INSERT INTO dbo.tbl_OffersComments
      (SellerItemID, UserID, Rate, Comment, IRecommendThisProduct,
       CreationDate, ModifiedUserID, LastDateModified, IsDeleted)
    VALUES
      (@SellerItemID, @UserID, @Rate, @Comment, @IRecommendThisProduct,
       GETDATE(), @UserID, GETDATE(), 0)
  `;

  const request = this.dbSettings.request();
  request.input("SellerItemID", sql.Int, sellerItemId);
  request.input("UserID", sql.Int, userId);
  request.input("Rate", sql.Int, rate);
  request.input("Comment", sql.NVarChar, comment || null);
  request.input("IRecommendThisProduct", sql.Bit, recommend ? 1 : 0);

  await request.query(query);

  // ⏳ Après insertion → renvoie stats mises à jour
  return this.getRatings(sellerItemId);
}




}
