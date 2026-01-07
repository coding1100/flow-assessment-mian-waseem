import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { TenantsModule } from '../tenants/tenants.module';
import { VendorsModule } from '../vendors/vendors.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { BankTransactionsModule } from '../bank-transactions/bank-transactions.module';
import { MatchesModule } from '../matches/matches.module';
import { GraphQLResolver } from './graphql.resolver';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      introspection: true,
    }),
    TenantsModule,
    VendorsModule,
    InvoicesModule,
    BankTransactionsModule,
    MatchesModule,
  ],
  providers: [GraphQLResolver],
})
export class GraphQLApiModule {}

