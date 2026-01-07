import { InputType, Field, Float } from '@nestjs/graphql';

@InputType()
export class BankTransactionFilters {
  @Field({ nullable: true })
  fromDate?: string;

  @Field({ nullable: true })
  toDate?: string;

  @Field(() => Float, { nullable: true })
  minAmount?: number;

  @Field(() => Float, { nullable: true })
  maxAmount?: number;
}

