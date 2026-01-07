import { ObjectType, Field, Int } from '@nestjs/graphql';
import { BankTransactionEdge } from './bank-transaction-edge.type';
import { PageInfo } from './page-info.type';

@ObjectType()
export class BankTransactionConnection {
  @Field(() => [BankTransactionEdge])
  edges: BankTransactionEdge[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;

  @Field(() => Int)
  totalCount: number;
}

