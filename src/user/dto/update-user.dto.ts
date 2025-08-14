import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, IsEmail, IsDateString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  username?: string; // ✅ accepté mais à mapper côté service

  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  numeroTelephone?: string; // ✅ accepté mais à mapper sur mobile

  @IsOptional()
  @Matches(/^(?:\+20|0)(?:10|11|12|15)\d{8}$/, {
    message: 'Numéro de téléphone égyptien invalide.',
  })
  mobile?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date must be in ISO 8601 format' })
  dateOfBirth?: string;
}
