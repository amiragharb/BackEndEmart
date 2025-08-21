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

  console.log("🔎 [findAll] options reçues:", { search, category, sort, limit });

  let query = `
    SELECT 
      ${limit ? `TOP(${limit})` : ""} 
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
      m.ItemBrandID,
      m.OfficialPrice,
      m.DrugClassificationTypeID,

      -- Logs debug : garder les 2 colonnes de photos
      m.PhotoFileName       AS MedicinePhoto_Main,
      mp.PhotoFileName      AS MedicinePhoto_Extra,

      -- Construction finale de l’URL de la photo
      CASE 
          WHEN m.PhotoFileName IS NOT NULL AND m.PhotoFileName <> '' 
              THEN 'https://test.itspark-eg.com/Uploads_emart/medicines_images/' + m.PhotoFileName
          WHEN mp.PhotoFileName IS NOT NULL AND mp.PhotoFileName <> '' 
              THEN 'https://test.itspark-eg.com/Uploads_emart/ProductPhotos/' + mp.PhotoFileName
          ELSE NULL
      END AS photoUrl

    FROM dbo.tbl_SellerItems si
    INNER JOIN dbo.lkp_Medicines m 
      ON si.MedicineID = m.MedicineID
    LEFT JOIN dbo.lkp_MedicinePhotos mp 
      ON si.MedicineID = mp.MedicineID 
     AND mp.IsDeleted = 0
    WHERE si.IsDeleted = 0 
      AND m.IsDeleted = 0
  `;

  const request = this.dbSettings.request();

  // 🔎 Recherche
  if (search) {
    query += ` AND (m.NameEn LIKE @Search OR m.NameAr LIKE @Search)`;
    request.input("Search", sql.NVarChar, `%${search}%`);
  }

  // 🔎 Catégorie
  if (category && category !== "All") {
    query += ` AND m.DrugClassificationTypeID = @CategoryID`;
    request.input("CategoryID", sql.Int, Number(category));
  }

  // 🔎 Tri
  if (sort === "PriceAsc") query += ` ORDER BY CAST(si.Price AS FLOAT) ASC`;
  else if (sort === "PriceDesc") query += ` ORDER BY CAST(si.Price AS FLOAT) DESC`;
  else if (sort === "BestRated") query += ` ORDER BY si.UserViewCount DESC`;
  else query += ` ORDER BY si.SellerItemID DESC`;

  console.log("📡 [SQL Final] →", query);

  // ✅ Exécution
  const r: IResult<any> = await request.query(query);

  // Ajouter des logs pour voir quelles colonnes contiennent les valeurs
  r.recordset.forEach(row => {
    console.log(`🖼️ SellerItemID=${row.SellerItemID} | Main=${row.MedicinePhoto_Main} | Extra=${row.MedicinePhoto_Extra} | URL=${row.photoUrl}`);
  });

  return r.recordset;
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
  m.ItemBrandID,
  m.OfficialPrice,
  mp.PhotoFileName AS MedicinePhoto,
  sp.PhotoFileName AS SellerPhotoFileName
FROM dbo.tbl_SellerItems si
INNER JOIN dbo.lkp_Medicines m ON si.MedicineID = m.MedicineID
LEFT JOIN dbo.lkp_MedicinePhotos mp ON si.MedicineID = mp.MedicineID AND mp.IsDeleted = 0
LEFT JOIN dbo.tbl_SellerPhotos sp ON si.SellerID = sp.SellerID AND sp.IsDeleted = 0
WHERE si.SellerItemID = @id AND si.IsDeleted = 0 AND m.IsDeleted = 0

      `);

    const item = r.recordset[0];
    if (!item) return null;

     return r.recordset.map(item => {
  let photoUrl: string | null = null;

  if (item.MedicinePhoto) {
    // Si c’est déjà une URL complète (http/https)
    if (item.MedicinePhoto.startsWith("http")) {
      photoUrl = item.MedicinePhoto;
    } else {
      // Sinon, on construit l’URL absolue
      photoUrl = `http://10.0.2.2:3002/uploads/${encodeURIComponent(item.MedicinePhoto)}`;
    }
  }

  return {
    ...item,
    photoUrl,
  };
});

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




}
