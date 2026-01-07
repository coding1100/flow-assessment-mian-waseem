import { IsArray, ValidateNested, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { BankTransactionItemDto } from './bank-transaction-item.dto';

export class ImportBankTransactionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankTransactionItemDto)
  transactions: BankTransactionItemDto[];

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

