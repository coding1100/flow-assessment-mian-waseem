import { InputType, Field, Int, Float } from '@nestjs/graphql';

@InputType()
export class InvoiceFilters {
  @Field({ nullable: true })
  status?: string;

  @Field(() => Int, { nullable: true })
  vendorId?: number;

  @Field({ nullable: true })
  fromDate?: string;

  @Field({ nullable: true })
  toDate?: string;

  @Field(() => Float, { nullable: true })
  minAmount?: number;

  @Field(() => Float, { nullable: true })
  maxAmount?: number;
}

