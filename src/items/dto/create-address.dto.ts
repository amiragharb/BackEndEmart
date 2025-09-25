// src/addresses/dto/create-address.dto.ts
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAddressDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(400) addressLine?: string;
  @IsOptional() @IsNumber() governorateId?: number;
  @IsOptional() @IsNumber() districtId?: number;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
