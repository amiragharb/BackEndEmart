import { Module, Global } from '@nestjs/common';
import * as sql from 'mssql';



const testDbProvider = {
  provide: 'MSSQL_SETTINGS_CONNECTION', // 🔹 TEST_eCommerce
  useFactory: async () => {
    const pool = new sql.ConnectionPool({
      server: process.env.DB_SETTINGS_SERVER as string,
      port: Number(process.env.DB_SETTINGS_PORT || 1433),
      database: process.env.DB_SETTINGS_NAME as string,
      user: process.env.DB_SETTINGS_USER as string,
      password: process.env.DB_SETTINGS_PASSWORD as string,
      options: {
        encrypt: process.env.DB_SETTINGS_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_SETTINGS_TRUST_SERVER_CERTIFICATE === 'true',
      },
    });
    await pool.connect();
    console.log('✅ Connected to TEST_eCommerce');
    return pool;
  },
};

@Global()
@Module({
  providers: [ testDbProvider],
  exports: [ 'MSSQL_SETTINGS_CONNECTION'], // ✅ exporter les 2
})
export class MssqlModule {}
