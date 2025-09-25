import { IsOptional, IsString, IsBoolean } from 'class-validator';
export class CreateCiConfigDto {
    @IsOptional()
  @IsString()
  CIPrimaryColor?: string;

  @IsOptional()
  @IsString()
  CISecondaryColor?: string;

  @IsOptional()
  @IsString()
  CIClientName?: string;

  @IsOptional()
  @IsString()
  CILogo?: string;

  @IsOptional()
  @IsBoolean()
  CIShowBrands?: boolean;

  @IsOptional()
  @IsBoolean()
  CIShowTopSeller?: boolean;

  @IsOptional()
  @IsBoolean()
  CIShowCategories?: boolean;

  @IsOptional()
  @IsBoolean()
  CIEnableGoogleLogin?: boolean;

  @IsOptional()
  @IsBoolean()
  CIEnableFacebookLogin?: boolean;

  @IsOptional()
  @IsBoolean()
  CIEnableAppleLogin?: boolean;

  @IsOptional()
  @IsString()
  CIDefaultLanguage?: string;
}
