/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Req,
  BadRequestException,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ---------------- PROFILE ----------------
   // user.controller.ts
@UseGuards(JwtAuthGuard)
@Get('profile')
async getProfile(@Req() req: any) {
  return this.userService.getProfileById(req.user.sub);
}


  // ---------------- SIGNUP ----------------
  @Post('signup')
create(@Body() createUserDto: CreateUserDto) {
  console.log('[SIGNUP] body keys =', Object.keys(createUserDto));
  console.log('[SIGNUP] DTO content =', createUserDto);
  return this.userService.create(createUserDto);
}
@Post('firebase-login')
async firebaseLogin(@Body() body: { idToken: string; provider: 'google'|'facebook' }) {
  const { idToken, provider } = body || {};
  if (!idToken) throw new BadRequestException('idToken required');
   console.log('[BACKEND] Reçu:', body);

  const jwt = await this.userService.loginWithIdToken(idToken, provider);
  return { access_token: jwt };
}


  // ---------------- LOGIN ----------------
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    console.log('📥 [LOGIN] Credentials reçues:', loginDto);
    const res = await this.userService.login(loginDto);
    console.log('📤 [LOGIN] Réponse envoyée:', res);
    return res;
  }

  // ---------------- UPDATE PROFILE ----------------
  @UseGuards(JwtAuthGuard)
  @Patch('update')
  async updateUser(@Req() req: Request, @Body() updateUserDto: UpdateUserDto) {
    const userId = (req.user as any)?.sub;

    if (!userId) throw new BadRequestException('User ID from token is missing');
    console.log(`🔹 [UPDATE PROFILE] Mise à jour userId=${userId} avec:`, updateUserDto);
    return this.userService.update(userId, updateUserDto);
  }

  // ---------------- LOGOUT ----------------
@UseGuards(JwtAuthGuard)
@Post('logout')
async logout(@Req() req: Request) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) throw new BadRequestException('Token is required');
  await this.userService.logout(token);
  return { message: 'Logged out successfully' };
}


  // ---------------- UPDATE PASSWORD ----------------
  @UseGuards(JwtAuthGuard)
  @Patch('update-password')
  async updatePassword(
    @Req() req: Request,
    @Body('newPassword') newPassword: string,
  ) {
const userId = (req.user as any)?.sub;
    if (!userId) throw new BadRequestException('User ID from token is missing');
    console.log(`📥 [UPDATE PASSWORD] userId=${userId}`);
    return this.userService.updatePassword(userId, newPassword);
  }

  // ---------------- FORGET PASSWORD ----------------
  @Post('forget-password')
  async forgetPassword(@Body('email') email: string) {
    console.log(`📩 [FORGET PASSWORD] Email reçu: ${email}`);
    await this.userService.forgetPassword(email);
    return { message: '✅ Temporary password sent to email.' };
  }

  // ---------------- VERIFY TEMP PASSWORD ----------------
  @Post('verify-temp-password')
  async verifyTempPassword(
    @Body('email') email: string,
    @Body('tempPassword') tempPassword: string,
  ) {
    const isValid = await this.userService.verifyTempPassword(email, tempPassword);
    if (!isValid) throw new BadRequestException('Invalid temporary password');
    return { success: true, message: 'Temporary password is valid.' };
  }
}
