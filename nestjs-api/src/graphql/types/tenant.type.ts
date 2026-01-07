import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class Tenant {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  createdAt: Date;
}

