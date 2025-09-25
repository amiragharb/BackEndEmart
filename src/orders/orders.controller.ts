// src/orders/orders.controller.ts
import {
  Controller,
  Get,
  Req,
  UseGuards,
  BadRequestException,
  Param,
  ParseIntPipe,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  Put,
  Delete,
  UsePipes,
  ValidationPipe,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from 'src/user/jwt-auth/jwt-auth.guard';
import { AddressDto } from './entities/AddressDto.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  /** util: stringify propre (évite les erreurs de circular refs) */
  private safeJson(v: unknown): string {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  /** util: extrait IP (derrière proxy si présent) */
  private getIp(req: any): string {
    return (
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      ''
    );
  }

  /** util: récupère l'id user depuis le token */
  private getUserId(req: any): number {
    return Number(req.user?.sub ?? req.user?.userId);
  }

  // GET /orders/addresses → adresses du user connecté
  @UseGuards(JwtAuthGuard)
  @Get('addresses')
  async getMyAddresses(@Req() req): Promise<AddressDto[]> {
    const start = Date.now();
    const ip = this.getIp(req);
    const ua = req.headers?.['user-agent'];
    const userId = this.getUserId(req);

    this.logger.log(
      `[GET /orders/addresses] start uid=${userId} ip=${ip} ua="${ua}"`,
    );

    if (!userId) {
      this.logger.warn(
        `[GET /orders/addresses] missing userId in token (req.user=${this.safeJson(
          req.user,
        )})`,
      );
      throw new BadRequestException('Invalid token: user id missing');
    }

    try {
      const res = await this.ordersService.findByUser(userId);
      const ms = Date.now() - start;
      this.logger.log(
        `[GET /orders/addresses] ok uid=${userId} count=${res.length} ${ms}ms`,
      );
      return res;
    } catch (err: any) {
      const ms = Date.now() - start;
      this.logger.error(
        `[GET /orders/addresses] fail uid=${userId} ${ms}ms: ${err?.message}`,
        err?.stack,
      );
      throw err;
    }
  }

  // GET /orders/addresses/:id → une adresse du user connecté
  @UseGuards(JwtAuthGuard)
  @Get('addresses/:id')
  async getOneAddress(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AddressDto> {
    const start = Date.now();
    const userId = this.getUserId(req);
    if (!userId) throw new BadRequestException('Invalid token: user id missing');

    this.logger.log(`[GET /orders/addresses/${id}] start uid=${userId}`);
    try {
      const row = await this.ordersService.findOneForUser(userId, id);
      const ms = Date.now() - start;
      this.logger.log(
        `[GET /orders/addresses/${id}] ok uid=${userId} ${ms}ms`,
      );
      return row;
    } catch (err: any) {
      const ms = Date.now() - start;
      this.logger.error(
        `[GET /orders/addresses/${id}] fail uid=${userId} ${ms}ms: ${err?.message}`,
        err?.stack,
      );
      throw err;
    }
  }

  // POST /orders/addresses → créer une adresse pour le user connecté
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post('addresses')
  async addAddress(
    @Req() req,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressDto> {
    const start = Date.now();
    const ip = this.getIp(req);
    const ua = req.headers?.['user-agent'];
    const userId = this.getUserId(req);

    const bodySize = Buffer.byteLength(this.safeJson(dto), 'utf8');
    this.logger.log(
      `[POST /orders/addresses] start uid=${userId} ip=${ip} ua="${ua}" body=${bodySize}B payload=${this.safeJson(
        dto,
      )}`,
    );

    if (!userId) {
      this.logger.warn(
        `[POST /orders/addresses] missing userId in token (req.user=${this.safeJson(
          req.user,
        )})`,
      );
      throw new BadRequestException('Invalid token: user id missing');
    }

    try {
      const created = await this.ordersService.addAddress(userId, dto);
      const ms = Date.now() - start;
      this.logger.log(
        `[POST /orders/addresses] ok uid=${userId} userLocationId=${created.userLocationId} ${ms}ms`,
      );
      return created;
    } catch (err: any) {
      const ms = Date.now() - start;
      this.logger.error(
        `[POST /orders/addresses] fail uid=${userId} ${ms}ms: ${err?.message}`,
        err?.stack,
      );
      throw err;
    }
  }

  // PUT /orders/addresses/:id → mise à jour
  @UseGuards(JwtAuthGuard)
  @Put('addresses/:id')
  async updateAddress(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    const start = Date.now();
    const userId = this.getUserId(req);
    if (!userId) throw new BadRequestException('Invalid token: user id missing');

    this.logger.log(`[PUT /orders/addresses/${id}] start uid=${userId}`);
    try {
      const row = await this.ordersService.updateAddress(userId, id, dto);
      const ms = Date.now() - start;
      this.logger.log(
        `[PUT /orders/addresses/${id}] ok uid=${userId} ${ms}ms`,
      );
      return row;
    } catch (err: any) {
      const ms = Date.now() - start;
      this.logger.error(
        `[PUT /orders/addresses/${id}] fail uid=${userId} ${ms}ms: ${err?.message}`,
        err?.stack,
      );
      throw err;
    }
  }

  // DELETE /orders/addresses/:id → soft delete
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('addresses/:id')
  async deleteAddress(
    @Req() req,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const start = Date.now();
    const userId = this.getUserId(req);
    if (!userId) throw new BadRequestException('Invalid token: user id missing');

    this.logger.log(`[DELETE /orders/addresses/${id}] start uid=${userId}`);
    try {
      await this.ordersService.deleteAddress(userId, id);
      const ms = Date.now() - start;
      this.logger.log(
        `[DELETE /orders/addresses/${id}] ok uid=${userId} ${ms}ms`,
      );
    } catch (err: any) {
      const ms = Date.now() - start;
      this.logger.error(
        `[DELETE /orders/addresses/${id}] fail uid=${userId} ${ms}ms: ${err?.message}`,
        err?.stack,
      );
      throw err;
    }
  }
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@Body() dto: CreateOrderDto, @Req() req: any) {
    // Si tu as un AuthGuard qui met req.user, vérifie la cohérence
    if (req.user?.id && Number(req.user.id) !== Number(dto.userId)) {
      return { statusCode: 403, error: 'User mismatch' };
    }
    const result = await this.ordersService.create(dto);
    return { success: true, ...result };
  }
  @Get(':orderId')
  async getDetails(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Req() req: any,
  ) {
    // si tu as un guard JWT, il mettra souvent req.user.{userId|UserID}
    const userId =
      req?.user?.userId ??
      req?.user?.UserID ??
      req?.user?.id ??
      req?.user?.Id ??
      null;

    return this.ordersService.getOrderDetails(orderId, userId);
  }
 // GET /orders/user/:userId
@Get('user/:userId')
async listByUser(@Param('userId', ParseIntPipe) userId: number) {
  return await this.ordersService.listByUser(userId); // → [{ orderId, orderNumber, orderDate, total, statusNameAr/En }, ...]
}

}
