import { InputType, Field, Int, Float } from '@nestjs/graphql';

@InputType()
export class MatchCandidateFilters {
  @Field(() => Int, { nullable: true })
  minScore?: number;

  @Field(() => Int, { nullable: true })
  maxScore?: number;

  @Field({ nullable: true })
  status?: string;
}

