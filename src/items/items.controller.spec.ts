import { Controller, Get, Param } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  // GET /items
  @Get()
  async findAll() {
    return this.itemsService.findAll();
  }

  // GET /items/:id
  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.itemsService.findOne(Number(id));
  }
}
