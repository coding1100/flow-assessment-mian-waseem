import {
  Controller,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { BankTransactionsService } from './bank-transactions.service';
import { ImportBankTransactionsDto } from './dto/import-bank-transactions.dto';
import { JwtAuthGuard, RolesGuard, Roles } from 'src/auth';

@Controller('tenants/:tenant_id/bank-transactions')
export class BankTransactionsController {
  constructor(
    private readonly bankTransactionsService: BankTransactionsService,
  ) {}

  @Post('import')
  async import(
    @Param('tenant_id', ParseIntPipe) tenantId: number,
    @Body() dto: ImportBankTransactionsDto,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    return this.bankTransactionsService.import(
      tenantId,
      dto,
      idempotencyKeyHeader,
    );
  }
}

