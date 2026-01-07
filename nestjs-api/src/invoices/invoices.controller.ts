import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQuery } from './dto/list-invoices.query';
import { JwtAuthGuard, Roles, RolesGuard } from 'src/auth';

@Controller('tenants/:tenantId/invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(tenantId, dto);
  }

  @Get()
  findAll(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Query() query: ListInvoicesQuery,
  ) {
    return this.invoicesService.findAll(tenantId, query);
  }

  @Delete(':id')
  remove(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.invoicesService.remove(tenantId, id);
  }
}


