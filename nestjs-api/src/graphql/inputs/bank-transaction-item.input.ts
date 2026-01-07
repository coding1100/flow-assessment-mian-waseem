import { InputType, Field, Float } from '@nestjs/graphql';

@InputType()
export class BankTransactionItemInput {
  @Field()
  externalId: string;

  @Field()
  postedAt: string;

  @Field(() => Float)
  amount: number;

  @Field({ nullable: true })
  currency?: string;

  @Field({ nullable: true })
  description?: string;
}

