import { IsOptional, IsInt, Min } from 'class-validator';

export class ReconcileDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  topN?: number = 10;
}

