import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class MatchCandidate {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  invoiceId: number;

  @Field(() => Int)
  transactionId: number;

  @Field(() => Float)
  score: number;

  @Field()
  status: string;
}

