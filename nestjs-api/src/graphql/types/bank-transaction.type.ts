import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class BankTransaction {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  tenantId: number;

  @Field()
  externalId: string;

  @Field()
  postedAt: Date;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field()
  createdAt: Date;
}

