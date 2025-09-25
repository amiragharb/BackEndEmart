import { Test, TestingModule } from '@nestjs/testing';
import { CiConfigService } from './ci_config.service';

describe('CiConfigService', () => {
  let service: CiConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CiConfigService],
    }).compile();

    service = module.get<CiConfigService>(CiConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
