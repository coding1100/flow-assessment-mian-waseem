import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';

@Controller('tenants/:tenantId/vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  create(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorsService.create(tenantId, dto);
  }

  @Get()
  findAll(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.vendorsService.findAll(tenantId);
  }
}

