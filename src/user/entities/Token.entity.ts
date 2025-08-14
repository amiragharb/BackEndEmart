/* eslint-disable prettier/prettier */

// Représentation d'une ligne dans dbo.UserTokens
export class Token {
  tokenId?: number;   // IDENTITY dans SQL (optionnel côté TS)
  userId: number;     // FK vers tbl_Users.UserID
  token: string;      // le JWT (ou refresh token)
  expiresAt: Date;    // date d’expiration
  createdAt?: Date;   // rempli par SQL (DEFAULT GETDATE())
}
