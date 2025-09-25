// src/orders/dto/update-address.dto.ts
import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAddressDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() address?: string;

  @IsOptional() @IsString() streetNameOrNumber?: string;
  @IsOptional() @IsString() buildingNameOrNumber?: string;
  @IsOptional() @IsString() floorNumber?: string;
  @IsOptional() @IsString() apartment?: string;
  @IsOptional() @IsString() nearestLandmark?: string;

  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number;

  /** PAYS (texte) */
  @IsOptional() @IsString() countryName?: string;

  /** ÉTAT (texte) */
  @IsOptional() @IsString() governorateName?: string;

  /** VILLE (id) */
  @IsOptional() @Type(() => Number) @IsNumber() districtId?: number;

  @IsOptional() @IsBoolean() isHome?: boolean;
  @IsOptional() @IsBoolean() isWork?: boolean;
}
