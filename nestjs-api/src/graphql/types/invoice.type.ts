import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class Invoice {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  tenantId: number;

  @Field(() => Int)
  vendorId: number;

  @Field()
  invoiceNumber: string;

  @Field()
  invoiceDatetime: Date;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field()
  status: string;

  @Field()
  createdAt: Date;
}

