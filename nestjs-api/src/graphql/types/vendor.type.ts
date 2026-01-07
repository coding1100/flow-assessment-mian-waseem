import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class Vendor {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  tenantId: number;

  @Field()
  name: string;

  @Field()
  createdAt: Date;
}

