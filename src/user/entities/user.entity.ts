export class User {
  userId: number;

  email: string;
  password: string;
  username: string;
  dateOfBirth: Date | null;
  numeroTelephone: string;
  status: 'active' | 'not verified';

  // ✅ client => NULL ; uniquement non-null si rattaché à un vendeur
  sellerId?: number | null;

  otp?: string | null;
  otpExpires?: Date | null;
  tempPassword?: string | null;
  tempPasswordExpires?: Date | null;
}
