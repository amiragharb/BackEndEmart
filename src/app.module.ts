// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { UserModule } from './user/user.module';
import { MssqlModule } from './DataBasemssql/mssql.module';
import { ItemsModule } from './items/items.module';
import { CiConfigModule } from './ci_config/ci_config.module';
import { OrdersModule } from './orders/orders.module';

const mongoUri = process.env.MONGO_URI;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...(mongoUri ? [MongooseModule.forRoot(mongoUri)] : []), // ← optionnel
    MssqlModule,
    UserModule,
    ItemsModule,
    CiConfigModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
