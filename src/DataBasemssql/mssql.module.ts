import { Module, Global } from '@nestjs/common';
import * as sql from 'mssql';

const devDbProvider = {
  provide: 'MSSQL_CONNECTION', // 🔹 DEV_eCommerce
  useFactory: async () => {
    const pool = new sql.ConnectionPool({
      server: process.env.DB_SERVER as string,
      port: Number(process.env.DB_PORT || 1433),
      database: process.env.DB_NAME as string,
      user: process.env.DB_USER as string,
      password: process.env.DB_PASSWORD as string,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      },
    });
    await pool.connect();
    console.log('✅ Connected to DEV_eCommerce');
    return pool;
  },
};

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
  providers: [devDbProvider, testDbProvider],
  exports: ['MSSQL_CONNECTION', 'MSSQL_SETTINGS_CONNECTION'], // ✅ exporter les 2
})
export class MssqlModule {}
