import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Invoice } from './invoice.type';
import { PageInfo } from './page-info.type';
import { InvoiceEdge } from './invoice-edge.type';

@ObjectType()
export class InvoiceConnection {
  @Field(() => [InvoiceEdge])
  edges: InvoiceEdge[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;

  @Field(() => Int)
  totalCount: number;
}

