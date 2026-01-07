import { ObjectType, Field, Float } from '@nestjs/graphql';

@ObjectType()
export class ReconciliationExplanation {
  @Field(() => Float)
  score: number;

  @Field(() => [String])
  explanations: string[];
}

