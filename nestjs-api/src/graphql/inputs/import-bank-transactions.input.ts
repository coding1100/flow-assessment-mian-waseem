import { InputType, Field } from '@nestjs/graphql';
import { BankTransactionItemInput } from './bank-transaction-item.input';

@InputType()
export class ImportBankTransactionsInput {
  @Field(() => [BankTransactionItemInput])
  transactions: BankTransactionItemInput[];

  @Field({ nullable: true })
  idempotencyKey?: string;
}

