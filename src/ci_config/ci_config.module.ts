import { Module } from '@nestjs/common';
import { CiConfigService } from './ci_config.service';
import { CiConfigController } from './ci_config.controller';

@Module({
    imports: [], // ou mieux: rien ici, juste dans AppModule
  controllers: [CiConfigController],
  providers: [CiConfigService],
})
export class CiConfigModule {}
