import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CiConfigService } from './ci_config.service';
import { CreateCiConfigDto } from './dto/create-ci_config.dto';
import { UpdateCiConfigDto } from './dto/update-ci_config.dto';

@Controller('ci-config')
export class CiConfigController {
  constructor(private readonly ciConfigService: CiConfigService) {}

  @Get()
  async getConfig() {
    return this.ciConfigService.getConfig();
  }
}
