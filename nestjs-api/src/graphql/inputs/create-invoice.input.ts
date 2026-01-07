import { InputType, Field, Int, Float } from '@nestjs/graphql';

@InputType()
export class CreateInvoiceInput {
  @Field(() => Int)
  vendorId: number;

  @Field()
  invoiceDatetime: string;

  @Field(() => Float)
  amount: number;

  @Field({ nullable: true })
  currency?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  status?: string;
}

