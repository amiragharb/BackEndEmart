import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Email ou numéro de téléphone est requis' })
  @Matches(
    /^(?:\+20|0(?:10|11|12|15)\d{8})$|^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    { message: 'Veuillez fournir un email valide ou un numéro égyptien valide' }
  )
  identifier: string; // Peut être email OU numéro de téléphone

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
