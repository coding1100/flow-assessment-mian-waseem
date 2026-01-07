import {
  Controller,
  Post,
  Get,
  Param,
  ParseIntPipe,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { ReconcileDto } from './dto/reconcile.dto';
import { JwtAuthGuard, Roles, RolesGuard } from 'src/auth';

@Controller('tenants/:tenantId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post('reconcile')
  reconcile(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: ReconcileDto,
  ) {
    return this.matchesService.reconcile(tenantId, dto.topN);
  }

  @Post('matches/:matchId/confirm')
  confirm(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
  ) {
    return this.matchesService.confirm(tenantId, matchId);
  }

  @Get('reconcile/explain')
  explain(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Query('invoice_id', ParseIntPipe) invoiceId: number,
    @Query('transaction_id', ParseIntPipe) transactionId: number,
  ) {
    return this.matchesService.explainMatch(tenantId, invoiceId, transactionId);
  }
}

