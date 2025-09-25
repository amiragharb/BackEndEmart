import { Test, TestingModule } from '@nestjs/testing';
import { CiConfigController } from './ci_config.controller';
import { CiConfigService } from './ci_config.service';

describe('CiConfigController', () => {
  let controller: CiConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CiConfigController],
      providers: [CiConfigService],
    }).compile();

    controller = module.get<CiConfigController>(CiConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
