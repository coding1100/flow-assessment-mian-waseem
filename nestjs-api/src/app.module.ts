import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantsModule } from './tenants/tenants.module';
import { InvoicesModule } from './invoices/invoices.module';
import { VendorsModule } from './vendors/vendors.module';
import { BankTransactionsModule } from './bank-transactions/bank-transactions.module';
import { MatchesModule } from './matches/matches.module';
import { GraphQLApiModule } from './graphql/graphql.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: join(__dirname, '../../.env'),
      isGlobal: true,
    }),
    AuthModule,
    CommonModule,
    GraphQLApiModule,
    TenantsModule,
    InvoicesModule,
    VendorsModule,
    BankTransactionsModule,
    MatchesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
