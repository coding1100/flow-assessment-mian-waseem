import { ObjectType, Field } from '@nestjs/graphql';
import { Invoice } from './invoice.type';

@ObjectType()
export class InvoiceEdge {
  @Field(() => Invoice)
  node: Invoice;

  @Field()
  cursor: string;
}

