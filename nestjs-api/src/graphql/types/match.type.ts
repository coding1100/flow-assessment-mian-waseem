import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class Match {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  tenantId: number;

  @Field(() => Int)
  invoiceId: number;

  @Field(() => Int)
  bankTransactionId: number;

  @Field(() => Float)
  score: number;

  @Field()
  status: string;

  @Field()
  createdAt: Date;
}

