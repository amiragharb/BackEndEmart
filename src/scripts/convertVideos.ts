import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import sql from "mssql";

// 📂 Chemin vers ton dossier des vidéos
const videosDir = "C:/path/to/Uploads_emart/doctor_Videos";

// 🔌 Connexion à ta base SQL Server
const dbConfig: sql.Config = {
  user: "sa",
  password: "your_password",
  server: "127.0.0.1",
  database: "TEST_eCommerce",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function convertAndUpdate() {
  try {
    await sql.connect(dbConfig);

    const files = fs.readdirSync(videosDir).filter(f => f.endsWith(".wmv"));

    for (const file of files) {
      const inputPath = path.join(videosDir, file);
      const outputFile = file.replace(".wmv", ".mp4");
      const outputPath = path.join(videosDir, outputFile);

      console.log(`🎥 Conversion: ${file} → ${outputFile}`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .videoCodec("libx264")
          .audioCodec("aac")
          .on("end", () => {
            console.log(`✅ Conversion terminée: ${outputFile}`);
            resolve();
          })
          .on("error", (err) => {
            console.error(`❌ Erreur conversion ${file}:`, err);
            reject(err);
          })
          .run();
      });

      const request = new sql.Request();
      await request
        .input("oldName", sql.NVarChar, file)
        .input("newName", sql.NVarChar, outputFile)
        .query(`
          UPDATE dbo.lkp_MedicineVideos
          SET VideoFileServerName = @newName,
              VideoFileName = REPLACE(VideoFileName, '.wmv', '.mp4')
          WHERE VideoFileServerName = @oldName
        `);

      console.log(`📝 DB mise à jour pour: ${outputFile}`);

      fs.unlinkSync(inputPath); // 🗑️ supprime l’ancien
      console.log(`🗑️ Supprimé: ${file}`);
    }
  } catch (err) {
    console.error("❌ Erreur globale:", err);
  } finally {
    sql.close();
  }
}

convertAndUpdate();
