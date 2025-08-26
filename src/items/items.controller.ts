import { Controller, Get, Query, Param, Inject, Post, Body } from '@nestjs/common';
import { ItemsService } from './items.service';
import { ConnectionPool } from 'mssql';

@Controller('items')
export class ItemsController {
  constructor(
    private readonly itemsService: ItemsService,
    @Inject('MSSQL_CONNECTION') private readonly db: ConnectionPool,
  ) {}

  // 🔹 GET /items?search=shoe&category=Fashion&sort=PriceAsc&limit=10
  @Get()
  async getAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: number,
  ) {
    return this.itemsService.findAll({ search, category, sort, limit });
  }

  @Get('categories')
  async getCategories() {
    return this.itemsService.findCategories();
  }

  // ✅ doit être placé avant @Get(':id')
  @Get('test-settings')
  async testSettings() {
    console.log("📡 [Controller] /items/test-settings appelé");
    return this.itemsService.testSettings();
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.itemsService.findOne(Number(id));
  }

  @Post(':id/ratings')
  async rateProduct(
    @Param('id') id: string,
    @Body() body: { userId: number; rate: number; comment?: string; recommend?: boolean },
  ) {
    return this.itemsService.rateProduct(
      Number(id),
      body.userId,
      body.rate,
      body.comment,
      body.recommend ?? false,
    );
  }
@Get(':id/ratings')
async getRatings(@Param('id') id: string) {
  return this.itemsService.getRatings(Number(id));
}


}
