import { ObjectType, Field } from '@nestjs/graphql';
import { BankTransaction } from './bank-transaction.type';

@ObjectType()
export class BankTransactionEdge {
  @Field(() => BankTransaction)
  node: BankTransaction;

  @Field()
  cursor: string;
}

