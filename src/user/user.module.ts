import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { JwtStrategy } from './jwt-auth/jwt.strategy';
import { MssqlModule } from 'src/DataBasemssql/mssql.module';

@Module({
  imports: [
    MssqlModule,                                   // 👈 important même si @Global, pour éviter les surprises
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [UserController],
  providers: [UserService, JwtStrategy],
  exports: [UserService],
})
export class UserModule {}
