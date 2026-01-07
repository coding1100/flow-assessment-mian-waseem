import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class ReconcileInput {
  @Field(() => Int, { nullable: true })
  topN?: number;
}

