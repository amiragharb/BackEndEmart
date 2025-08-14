import { Module, Global } from '@nestjs/common';
import * as sql from 'mssql';

const dbProvider = {
  provide: 'MSSQL_CONNECTION',              // 👈 token unique et constant
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
    console.log('✅ MSSQL Connected');
    return pool;
  },
};

@Global() // (facultatif, mais pratique)
@Module({
  providers: [dbProvider],
  exports: ['MSSQL_CONNECTION'],            // 👈 bien exporter le token
})
export class MssqlModule {}
