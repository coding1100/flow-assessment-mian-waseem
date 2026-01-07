import { IsString, IsNumber, IsDateString, IsOptional } from 'class-validator';

export class BankTransactionItemDto {
  @IsString()
  externalId: string;

  @IsDateString()
  postedAt: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

