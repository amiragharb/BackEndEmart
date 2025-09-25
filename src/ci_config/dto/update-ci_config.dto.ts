import { PartialType } from '@nestjs/mapped-types';
import { CreateCiConfigDto } from './create-ci_config.dto';

export class UpdateCiConfigDto extends PartialType(CreateCiConfigDto) {}
