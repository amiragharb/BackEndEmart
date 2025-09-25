// src/orders/dto/create-address.dto.ts
import { IsOptional, IsString, IsNumber, IsBoolean, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAddressDto {
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
  @IsNotEmpty() @IsString()
  countryName!: string;

  /** ÉTAT (gouvernorat) (texte) */
  @IsNotEmpty() @IsString()
  governorateName!: string;

  /** VILLE (district) */
  @IsOptional() @Type(() => Number) @IsNumber()
  districtId?: number;

  @IsOptional() @IsBoolean() isHome?: boolean;
  @IsOptional() @IsBoolean() isWork?: boolean;
}
