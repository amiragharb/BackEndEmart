import { IsEmail, IsString, MinLength, IsDateString, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName: string;

  @IsDateString({}, { message: 'Birthdate must be a valid date in ISO 8601 format' })
  @IsNotEmpty({ message: 'Birthdate is required' })
  dateOfBirth: string;

  @IsString()
  @IsNotEmpty({ message: 'Mobile is required' })
  @Matches(/^(?:\+20|0)(?:10|11|12|15)\d{8}$/, { message: 'Numéro de téléphone égyptien invalide' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  mobile: string;
}
