/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ConnectionPool, IResult } from 'mssql';
import * as sql from 'mssql';
import path from 'path';
import nodemailer from "nodemailer";

type SqlUser = {
  UserID: number;
  Email: string;
  FirstName: string | null;
  LastName: string | null;
  Mobile: string | null;
  BirthDate: Date | null;
  Password: string | null;
  IsActive: boolean | number | null;
  SellerID: number | null; // 1 => admin, sinon client
};

type SqlAuthExtras = {
  UserID: number;
  otp: string | null;
  otpExpires: Date | null;
  tempPassword: string | null;
  tempPasswordExpires: Date | null;
};

@Injectable()
export class UserService {
  
  constructor(
    private readonly jwtService: JwtService,
    // 👇 vient du MssqlModule (provider 'MSSQL_CONNECTION')
      @Inject('MSSQL_SETTINGS_CONNECTION') private readonly dbSettings: ConnectionPool, // TEST
  // 👈
  ) {}
  
  // -------------------- helpers --------------------
  private looksLikeEmail(s: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
  private isEgyptPhone(s: string) {
    return /^(?:\+20|0)(?:10|11|12|15)\d{8}$/.test(s);
  }
 private roleFromSellerId(sellerId: number | null | undefined, isAdmin?: boolean) {
  if (isAdmin) return 'admin';
  if (sellerId && sellerId > 0) return 'seller';
  return 'client';
}
z
  private nowPlusMinutes(min: number) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + min);
    return d;
  }
  private generateStrongPassword(length: number): string {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const allChars = upper + lower + digits;
    let password = '';
    const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
    password += pick(upper);
    password += pick(lower);
    password += pick(digits);
    for (let i = 3; i < length; i++) password += pick(allChars);
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  // -------------------- low-level SQL --------------------
  private async findUserByEmailOrMobile(identifier: string): Promise<SqlUser | null> {
    const byEmail = this.looksLikeEmail(identifier);
    const q = byEmail
      ? `
        SELECT TOP (1) UserID, Email, FirstName, LastName, Mobile, BirthDate, Password, IsActive, SellerID
        FROM dbo.tbl_Users
        WHERE LOWER(Email) = LOWER(@identifier)
      `
      : `
        SELECT TOP (1) UserID, Email, FirstName, LastName, Mobile, BirthDate, Password, IsActive, SellerID
        FROM dbo.tbl_Users
        WHERE Mobile = @identifier
      `;
    const r: IResult<SqlUser> = await this.dbSettings
      .request()
      .input('identifier', sql.NVarChar, identifier)
      .query(q);
    return r.recordset[0] ?? null;
  }

  private async findUserByEmail(email: string): Promise<SqlUser | null> {
    const r: IResult<SqlUser> = await this.dbSettings
      .request()
      .input('email', sql.NVarChar, email)
      .query(`
        SELECT TOP (1) UserID, Email, FirstName, LastName, Mobile, BirthDate, Password, IsActive, SellerID
        FROM dbo.tbl_Users
        WHERE LOWER(Email) = LOWER(@email)
      `);
    return r.recordset[0] ?? null;
  }

  private async findUserById(userId: number): Promise<SqlUser | null> {
    const r: IResult<SqlUser> = await this.dbSettings
      .request()
      .input('id', sql.Int, userId)
      .query(`
        SELECT TOP (1) UserID, Email, FirstName, LastName, Mobile, BirthDate, Password, IsActive, SellerID
        FROM dbo.tbl_Users WHERE UserID = @id
      `);
    return r.recordset[0] ?? null;
  }

  private async ensureAuthExtras(userId: number): Promise<void> {
    const res = await this.dbSettings
      .request()
      .input('id', sql.Int, userId)
      .query(`
        UPDATE dbo.UserAuthExtras SET UserID = UserID WHERE UserID = @id;
        SELECT @@ROWCOUNT AS n;
      `);
    const n = res.recordset?.[0]?.n ?? 0;
    if (n === 0) {
      await this.dbSettings.request().input('id', sql.Int, userId).query(`
        INSERT INTO dbo.UserAuthExtras (UserID) VALUES (@id);
      `);
    }
  }

  private async getAuthExtras(userId: number): Promise<SqlAuthExtras | null> {
    const r: IResult<SqlAuthExtras> = await this.dbSettings
      .input('id', sql.Int, userId)
      .query(`
        SELECT UserID, otp, otpExpires, tempPassword, tempPasswordExpires
        FROM dbo.UserAuthExtras WHERE UserID = @id
      `);
    return r.recordset[0] ?? null;
  }

  private async upsertToken(userId: number, token: string, expiresAt: Date): Promise<void> {
    await this.dbSettings
      .request()
      .input('uid', sql.Int, userId)
      .input('tk', sql.NVarChar, token)
      .input('exp', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO dbo.UserTokens (UserID, token, expiresAt)
        VALUES (@uid, @tk, @exp);
      `);
  }

  private async deleteToken(token: string): Promise<number> {
    const res = await this.dbSettings
      .request()
      .input('tk', sql.NVarChar, token)
      .query(`DELETE FROM dbo.UserTokens WHERE token = @tk; SELECT @@ROWCOUNT AS affected;`);
    return res.recordset?.[0]?.affected ?? 0;
  }

  // -------------------- SIGNUP --------------------
  async create(dto: CreateUserDto): Promise<any> {
  const email = dto.email.trim().toLowerCase();

  // 1) Vérifier unicité email
  const exists = await this.findUserByEmail(email);
  if (exists) throw new BadRequestException('Email already in use.');

  // 1bis) Vérifier unicité mobile côté client
  const mobileUsed = await this.dbSettings.request()
    .input('Mobile', sql.NVarChar, dto.mobile.trim())
    .query(`
      SELECT TOP 1 1
      FROM dbo.tbl_Users
      WHERE Mobile = @Mobile
        AND ISNULL(IsGooglePlusAccount, 0) = 0
        AND ISNULL(IsFacebookAccount, 0) = 0
        AND SellerID IS NULL
    `);
  if (mobileUsed.recordset.length) {
    throw new BadRequestException('Mobile already in use.');
  }

  // 2) Hash du mot de passe
  const hashed = await bcrypt.hash(dto.password, 10);

  // 3) Insertion utilisateur
  const insertRes = await this.dbSettings
  .request()
  .input('Email', sql.NVarChar, email)
  .input('FirstName', sql.NVarChar, dto.firstName.trim())
  .input('LastName', sql.NVarChar, dto.lastName.trim())
  .input('Mobile', sql.NVarChar, dto.mobile.trim())
  .input('BirthDate', sql.DateTime2, dto.dateOfBirth ? new Date(dto.dateOfBirth) : null)
  .input('Password', sql.NVarChar, hashed)
  // Valeurs par défaut obligatoires
  .input('CountryID', sql.Int, 1)
  .input('IsServiceCashed', sql.Bit, 0)
  .input('IsGooglePlusAccount', sql.Bit, 0)
  .input('IsFacebookAccount', sql.Bit, 0)
  .input('IsMobileValidate', sql.Bit, 0)
  .input('CreatorUserID', sql.Int, 1) // user système
  .input('IsDeleted', sql.Bit, 0)
  .input('IsOnline', sql.Bit, 0)
  .input('IsBusy', sql.Bit, 0)
  .input('IsAdmin', sql.Bit, 0)
  .input('Ranking', sql.Decimal(5,2), 5.00)
  .input('UserTypeID', sql.Int, 1)
  .input('LanguageID', sql.Int, 1)
  .input('LoginCodeCount', sql.Int, 0)
  .input('UseMobileForDelivery', sql.Bit, 0)
  .input('IsSales', sql.Bit, 0)
  .input('IsFacebookLogin', sql.Bit, 0)
  .input('IsGoogleLogin', sql.Bit, 0)
  .input('ModifiedUserID', sql.Int, 1) // ✅ ajout obligatoire

  .query(`
    INSERT INTO dbo.tbl_Users (
      Email, FirstName, LastName, Mobile, BirthDate, Password,
      IsActive, CreationDate, CountryID, IsServiceCashed,
      IsGooglePlusAccount, IsFacebookAccount, IsMobileValidate, CreatorUserID,
      IsDeleted, IsOnline, IsBusy, IsAdmin, Ranking, UserTypeID, LanguageID,
      LoginCodeCount, UseMobileForDelivery, IsSales, IsFacebookLogin, IsGoogleLogin,ModifiedUserID
    )
    VALUES (
      @Email, @FirstName, @LastName, @Mobile, @BirthDate, @Password,
      1, SYSDATETIME(), @CountryID, @IsServiceCashed,
      @IsGooglePlusAccount, @IsFacebookAccount, @IsMobileValidate, @CreatorUserID,
      @IsDeleted, @IsOnline, @IsBusy, @IsAdmin, @Ranking, @UserTypeID, @LanguageID,
      @LoginCodeCount, @UseMobileForDelivery, @IsSales, @IsFacebookLogin, @IsGoogleLogin, @ModifiedUserID
    );
    SELECT SCOPE_IDENTITY() AS NewId;
  `);



  const newId: number = Number(insertRes.recordset?.[0]?.NewId);
  if (!newId) throw new InternalServerErrorException('Failed to create user');

  console.log(`✅ Utilisateur créé avec ID: ${newId}`);

  // 4) Relire l'utilisateur depuis la base pour confirmer
  const user = await this.findUserById(newId);
  if (!user) {
    console.error(`❌ Utilisateur ID ${newId} introuvable après insertion`);
    throw new InternalServerErrorException('User creation failed: not found after insert');
  }

  // 5) Créer la ligne UserAuthExtras
  await this.ensureAuthExtras(newId);

  // 6) Générer le JWT
  const payload = {
    sub: newId,
    email: user.Email,
    username: `${user.FirstName ?? ''} ${user.LastName ?? ''}`.trim() || user.Email,
    role: this.roleFromSellerId(user.SellerID),
    mobile: user.Mobile,
  };
  const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });

  // 7) Sauvegarder le token en base
  try {
    await this.upsertToken(newId, access_token, this.nowPlusMinutes(60));
    console.log(`✅ Token inséré pour UserID ${newId}`);
  } catch (err) {
    console.error(`❌ Échec d'insertion du token pour UserID ${newId}`, err);
    throw new InternalServerErrorException('Token storage failed');
  }

  // 8) Retourner la réponse
  return {
    access_token,
    user: {
      id: newId,
      email: user.Email,
      username: payload.username,
      role: payload.role,
    },
  };
}


  // -------------------- LOGIN (email OU mobile égyptien) --------------------
  async login(dto: LoginDto): Promise<{ access_token: string; user: any }> {
  const identifier = (dto as any).identifier
    ? String((dto as any).identifier).trim().toLowerCase()
    : String((dto as any).email ?? '').trim().toLowerCase();

  const pwd = dto.password ?? '';
  if (!identifier) throw new BadRequestException('Email or mobile is required');

  // Charger l'utilisateur
  const user = await this.findUserByEmailOrMobile(identifier);
  if (!user) throw new BadRequestException('Invalid credentials');

  let ok = false;

  // 1️⃣ Vérif mot de passe permanent
  if (user.Password) {
    ok = await bcrypt.compare(pwd, user.Password);
  }

  // 2️⃣ Si permanent KO, on teste le temporaire
  if (!ok) {
    const extras = await this.getAuthExtras(user.UserID);
    if (extras?.tempPassword && extras?.tempPasswordExpires) {
      const notExpired = new Date(extras.tempPasswordExpires) > new Date();
      if (notExpired) {
        ok = await bcrypt.compare(pwd, extras.tempPassword);
        if (ok) {
          // Optionnel: invalider le mot de passe temporaire après usage
          await this.dbSettings.request()
            .input('id', sql.Int, user.UserID)
            .query(`UPDATE dbo.UserAuthExtras SET tempPassword=NULL, tempPasswordExpires=NULL WHERE UserID=@id`);
        }
      }
    }
  }

  if (!ok) throw new BadRequestException('Invalid credentials');

  // Préparer payload et token
  const role = this.roleFromSellerId(user.SellerID);
  const username = [user.FirstName, user.LastName].filter(Boolean).join(' ').trim();

  const payload = {
    sub: user.UserID,
    email: user.Email,
    username: username || user.Email,
    role,
    mobile: user.Mobile,
  };

  const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });
  await this.upsertToken(user.UserID, access_token, this.nowPlusMinutes(60));

  return {
    access_token,
    user: {
      id: user.UserID,
      username: payload.username,
      email: user.Email,
      role,
    },
  };
}

  // -------------------- UPDATE (profil) --------------------
  async update(userIdStr: string, dto: UpdateUserDto): Promise<any> {
    const userId = Number(userIdStr);
    if (!Number.isInteger(userId)) throw new BadRequestException('Invalid user ID');

    const existing = await this.findUserById(userId);
    if (!existing) throw new NotFoundException('User not found');

    // Password via updatePassword(), pas ici
    if ((dto as any).password) delete (dto as any).password;

    // Applique champs optionnels
    const email = dto.email?.trim().toLowerCase() ?? existing.Email;
    const first = dto.firstName?.trim() ?? existing.FirstName ?? '';
    const last = dto.lastName?.trim() ?? existing.LastName ?? '';
    const mobile = dto.mobile?.trim() ?? existing.Mobile ?? '';
    const birth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : existing.BirthDate;

    await this.dbSettings
      .request()
      .input('Email', sql.NVarChar, email)
      .input('FirstName', sql.NVarChar, first)
      .input('LastName', sql.NVarChar, last)
      .input('Mobile', sql.NVarChar, mobile)
      .input('BirthDate', sql.DateTime2, birth)
      .input('id', sql.Int, userId)
      .query(`
        UPDATE dbo.tbl_Users
        SET Email=@Email, FirstName=@FirstName, LastName=@LastName,
            Mobile=@Mobile, BirthDate=@BirthDate, LastDateModified=SYSDATETIME()
        WHERE UserID=@id;
      `);

    const updated = await this.findUserById(userId);
    const role = this.roleFromSellerId(updated?.SellerID ?? 0);
    const username = [updated?.FirstName, updated?.LastName].filter(Boolean).join(' ').trim();

    return {
      id: userId,
      email: updated?.Email,
      username: username || updated?.Email,
      mobile: updated?.Mobile,
      dateOfBirth: updated?.BirthDate,
      role,
    };
  }

  // -------------------- UPDATE PASSWORD --------------------
  async updatePassword(userIdStr: string, newPassword: string): Promise<{ message: string }> {
    const userId = Number(userIdStr);
    if (!Number.isInteger(userId)) throw new BadRequestException('Invalid user ID');

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      throw new BadRequestException('Password must be at least 6 characters.');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.dbSettings
      .request()
      .input('pwd', sql.NVarChar, hashed)
      .input('id', sql.Int, userId)
      .query(`
        UPDATE dbo.tbl_Users SET Password=@pwd, LastDateModified=SYSDATETIME()
        WHERE UserID=@id;
      `);

    return { message: 'Password updated successfully.' };
  }

  // -------------------- FIND BY ID (profil + extras) --------------------
  async findById(userIdStr: string) {
    const userId = Number(userIdStr);
    if (!Number.isInteger(userId)) throw new BadRequestException('Invalid user ID');

    const user = await this.findUserById(userId);
    if (!user) throw new NotFoundException('User not found');

    const extras = await this.getAuthExtras(userId); // peut être null si pas encore créé
    const role = this.roleFromSellerId(user.SellerID);
    const username = [user.FirstName, user.LastName].filter(Boolean).join(' ').trim();

    return {
      id: user.UserID,
      email: user.Email,
      username: username || user.Email,
      mobile: user.Mobile,
      dateOfBirth: user.BirthDate,
      status: user.IsActive ? 'active' : 'not verified',
      role,
      otp: extras?.otp ?? null,
      otpExpires: extras?.otpExpires ?? null,
      tempPassword: extras?.tempPassword ?? null,
      tempPasswordExpires: extras?.tempPasswordExpires ?? null,
    };
  }

  // -------------------- LOGOUT --------------------
 async logout(token: string): Promise<void> {
  const affected = await this.deleteToken(token);
  if (affected === 0) throw new NotFoundException('Token not found or already invalidated');
}


  // -------------------- FORGET / VERIFY TEMP PASSWORD --------------------
  /* (meilleure pratique : ne pas remplacer le vrai password ici ; on pose un tempPassword hashé)
  async forgetPassword(email: string): Promise<void> {
    const user = await this.findUserByEmail(email);
    if (!user) throw new NotFoundException('User not found');

    // génère un temp password et le stocke hashé + expiry dans UserAuthExtras
    const tempPassword = this.generateStrongPassword(10);
    const tempHash = await bcrypt.hash(tempPassword, 10);
    const exp = this.nowPlusMinutes(30);

    await this.ensureAuthExtras(user.UserID);
    await this.db
      .request()
      .input('id', sql.Int, user.UserID)
      .input('tp', sql.NVarChar, tempHash)
      .input('exp', sql.DateTime2, exp)
      .query(`
        UPDATE dbo.UserAuthExtras
        SET tempPassword=@tp, tempPasswordExpires=@exp, otp=NULL, otpExpires=NULL
        WHERE UserID=@id;
      `);

    // envoi email via Brevo (déplace l'API key en .env)
    const brevoUrl = 'https://api.brevo.com/v3/smtp/email';
    const emailData = {
      sender: { name: 'esprit.tn', email: 'gharbi.miro25@gmail.com' },
      to: [{ email }],
      subject: 'Your eMart Temporary Password',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #fef6f3;">
          <h1 style="color:#EE6B33;">Your eMart Temporary Password</h1>
          <p>Use the temporary password below to log in and change it immediately.</p>
          <p style="font-size:18px;font-weight:bold;">${tempPassword}</p>
          <p style="color:#777;">This password expires in 30 minutes.</p>
        </div>`,
    };

    await axios.post(brevoUrl, emailData, {
        headers: {
            'Content-Type': 'application/json',
            'api-key': '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',
          },
    });
    console.log("Temp password généré:", tempPassword);
console.log("Temp password hash généré:", tempHash);

// Relire depuis la base juste après l’update
const extras = await this.getAuthExtras(user.UserID);

if (extras) {
console.log("Temp password hash en DB:", extras.tempPassword);
if (extras.tempPassword) {
  console.log("Compare result:", await bcrypt.compare(tempPassword, extras.tempPassword));
} else {
  console.log("No temp password hash found in DB (extras is null or tempPassword is null)");
}



  }}*/
  
async forgetPassword(email: string): Promise<void> {
  const user = await this.findUserByEmail(email);
  if (!user) throw new NotFoundException("User not found");

  // 1. Generate temporary password + hash
  const tempPassword = this.generateStrongPassword(10);
  const tempHash = await bcrypt.hash(tempPassword, 10);
  const exp = this.nowPlusMinutes(30);

  await this.ensureAuthExtras(user.UserID);
  await this.dbSettings
    .request()
    .input("id", sql.Int, user.UserID)
    .input("tp", sql.NVarChar, tempHash)
    .input("exp", sql.DateTime2, exp)
    .query(`
      UPDATE dbo.UserAuthExtras
      SET tempPassword=@tp, tempPasswordExpires=@exp, otp=NULL, otpExpires=NULL
      WHERE UserID=@id;
    `);

  // 2. Setup Nodemailer (SMTP Gmail ou autre)
  const transporter = nodemailer.createTransport({
    service: "gmail", // plus simple
    auth: {
      user: "gharbi.miro25@gmail.com",   // ⚠️ remplace par ton Gmail
      pass: "jqkx kfnv azly tmcw",  // ⚠️ mot de passe d'application Gmail (16 caractères)
    },
  });

  // 3. Préparer le logo en pièce jointe (comme la capture)
const logoPath = path.join(process.cwd(), "src/assets/logo.png");

  // 4. Construire l’email HTML avec cid
  const mailOptions = {
    from: '"eMart Support" <tonemail@gmail.com>',
    to: email,
    subject: "Your eMart Temporary Password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #fef6f3;">
        <div style="text-align:center; margin-bottom:15px;">
          <img src="cid:EMARTLOGO" style="width:120px; height:auto;" />
        </div>
        <h1 style="color:#EE6B33; text-align:center;">Your Temporary Password</h1>
        <p style="text-align:center;">Use this temporary password to log in and change it immediately:</p>
        <p style="font-size:20px; font-weight:bold; text-align:center;">${tempPassword}</p>
        <p style="color:#777; text-align:center;">This password expires in 30 minutes.</p>
      </div>
    `,
    attachments: [
      {
        filename: "logo.png",
        path: logoPath,
        cid: "EMARTLOGO" // 👈 identique à src="cid:EMARTLOGO"
      }
    ]
  };

  // 5. Envoyer l’email
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("📧 Email sent:", info.messageId);
  } catch (err) {
    console.error("❌ Failed to send email:", err);
    throw new InternalServerErrorException("Email not sent");
  }

  console.log("✅ Temp password generated:", tempPassword);
  console.log("🔒 Temp password hash generated:", tempHash);
}

  async verifyTempPassword(email: string, tempPassword: string): Promise<boolean> {
    try {
      const user = await this.findUserByEmail(email);
      if (!user) throw new NotFoundException('User not found');

      await this.ensureAuthExtras(user.UserID);
      const extras = await this.getAuthExtras(user.UserID);
      if (!extras?.tempPassword || !extras?.tempPasswordExpires) {
        throw new BadRequestException('No temporary password set');
      }
      if (new Date(extras.tempPasswordExpires) < new Date()) {
        throw new BadRequestException('Temporary password expired');
      }

      const ok = await bcrypt.compare(tempPassword, extras.tempPassword);
      if (!ok) throw new BadRequestException('Invalid temporary password');

      return true;
    } catch (e: any) {
      if (e instanceof NotFoundException || e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException('Failed to verify temporary password');
    }
    
  }
  // user.service.ts
async getProfileById(userId: number) {
  const user = await this.findUserById(userId);
  if (!user) throw new NotFoundException('User not found');

  return {
    id: user.UserID,
    email: user.Email,
    username: [user.FirstName, user.LastName].filter(Boolean).join(' ').trim(),
    numeroTelephone: user.Mobile,
    dateOfBirth: user.BirthDate,
    role: this.roleFromSellerId(user.SellerID),
  };
}
async loginWithIdToken(idToken: string, provider: 'google' | 'facebook') {
  if (provider !== 'google') {
    throw new BadRequestException('Provider non supporté pour le moment');
  }

  // Vérifier l'idToken Google
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: "195140518965-b6rc7vt001es9nf0sl3trvk8khu6babn.apps.googleusercontent.com", // 👈 serverClientId Flutter
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new BadRequestException('Impossible de récupérer les infos Google');
  }

  const email = payload.email.toLowerCase();
  let user = await this.findUserByEmail(email);

  // 🔹 Si l’utilisateur n’existe pas → création
  if (!user) {
    const insertRes = await this.dbSettings
  .request()
  .input('Email', sql.NVarChar, email)
  .input('FirstName', sql.NVarChar, payload.given_name || '')
  .input('LastName', sql.NVarChar, payload.family_name || '')
  .input('IsActive', sql.Bit, 1)
  .input('IsGooglePlusAccount', sql.Bit, 1) // login Google
  .input('IsFacebookAccount', sql.Bit, 0)
  .input('SellerID', sql.Int, null)
  .input('CountryID', sql.Int, 1)
  .input('IsServiceCashed', sql.Bit, 0)
  .input('IsMobileValidate', sql.Bit, 0)
  .input('CreatorUserID', sql.Int, 1)
  .input('IsDeleted', sql.Bit, 0)
  .input('IsOnline', sql.Bit, 0)
  .input('IsBusy', sql.Bit, 0)
  .input('IsAdmin', sql.Bit, 0)
  .input('Ranking', sql.Decimal(5, 2), 5.00)
  .input('UserTypeID', sql.Int, 1)
  .input('LanguageID', sql.Int, 1)
  .input('LoginCodeCount', sql.Int, 0)
  .input('UseMobileForDelivery', sql.Bit, 0)
  .input('IsSales', sql.Bit, 0)
  .input('IsFacebookLogin', sql.Bit, 0)
  .input('IsGoogleLogin', sql.Bit, 1)
  .input('ModifiedUserID', sql.Int, 1) // ✅ ajout obligatoire
 // ✅ très important
  .query(`
    INSERT INTO dbo.tbl_Users (
      Email, FirstName, LastName,
      IsActive, IsGooglePlusAccount, IsFacebookAccount,
      CreationDate, SellerID, CountryID, IsServiceCashed, IsMobileValidate,
      CreatorUserID, IsDeleted, IsOnline, IsBusy, IsAdmin, Ranking,
      UserTypeID, LanguageID, LoginCodeCount, UseMobileForDelivery,
      IsSales, IsFacebookLogin, IsGoogleLogin , ModifiedUserID
    )
    VALUES (
      @Email, @FirstName, @LastName,
      @IsActive, @IsGooglePlusAccount, @IsFacebookAccount,
      SYSDATETIME(), @SellerID, @CountryID, @IsServiceCashed, @IsMobileValidate,
      @CreatorUserID, @IsDeleted, @IsOnline, @IsBusy, @IsAdmin, @Ranking,
      @UserTypeID, @LanguageID, @LoginCodeCount, @UseMobileForDelivery,
      @IsSales, @IsFacebookLogin, @IsGoogleLogin , @ModifiedUserID
    );
    SELECT SCOPE_IDENTITY() AS NewId;
  `);


    const newId = Number(insertRes.recordset?.[0]?.NewId);
    user = await this.findUserById(newId);
  }

  if (!user) {
    throw new InternalServerErrorException('Utilisateur introuvable après création');
  }

  // 🔹 Génération du JWT interne eMart
  const payloadJwt = {
    sub: user.UserID,
    email: user.Email,
    username: `${user.FirstName ?? ''} ${user.LastName ?? ''}`.trim() || user.Email,
    role: this.roleFromSellerId(user.SellerID),
    mobile: user.Mobile,
  };

  const access_token = this.jwtService.sign(payloadJwt, { expiresIn: '1h' });

  console.log('[JWT SIGNED]', access_token);

  // 🔹 Stockage dans UserTokens
  await this.upsertToken(user.UserID, access_token, this.nowPlusMinutes(60));

  return access_token; // 👈 retourne juste le JWT brut
}

}
