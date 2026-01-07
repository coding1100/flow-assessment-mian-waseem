import { Resolver, Query, Mutation, Args, Int, Float, ObjectType, Field } from '@nestjs/graphql';
import { TenantsService } from '../tenants/tenants.service';
import { VendorsService } from '../vendors/vendors.service';
import { InvoicesService } from '../invoices/invoices.service';
import { BankTransactionsService } from '../bank-transactions/bank-transactions.service';
import { MatchesService } from '../matches/matches.service';
import { Tenant } from './types/tenant.type';
import { Vendor } from './types/vendor.type';
import { Invoice } from './types/invoice.type';
import { BankTransaction } from './types/bank-transaction.type';
import { MatchCandidate } from './types/match-candidate.type';
import { ReconciliationExplanation } from './types/reconciliation-explanation.type';
import { Match } from './types/match.type';
import { CreateTenantInput } from './inputs/create-tenant.input';
import { CreateVendorInput } from './inputs/create-vendor.input';
import { CreateInvoiceInput } from './inputs/create-invoice.input';
import { ImportBankTransactionsInput } from './inputs/import-bank-transactions.input';
import { ReconcileInput } from './inputs/reconcile.input';
import { InvoiceFilters } from './inputs/invoice-filters.input';
import { BankTransactionFilters } from './inputs/bank-transaction-filters.input';
import { MatchCandidateFilters } from './inputs/match-candidate-filters.input';
import { PaginationInput } from './inputs/pagination.input';
import { InvoiceConnection } from './types/invoice-connection.type';
import { BankTransactionConnection } from './types/bank-transaction-connection.type';

@Resolver()
export class GraphQLResolver {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly vendorsService: VendorsService,
    private readonly invoicesService: InvoicesService,
    private readonly bankTransactionsService: BankTransactionsService,
    private readonly matchesService: MatchesService,
  ) {}

  // Queries
  @Query(() => [Tenant], { name: 'tenants' })
  async getTenants(): Promise<Tenant[]> {
    return this.tenantsService.findAll();
  }

  @Query(() => [Vendor], { name: 'vendors' })
  async getVendors(
    @Args('tenantId', { type: () => Int }) tenantId: number,
  ): Promise<Vendor[]> {
    return this.vendorsService.findAll(tenantId);
  }

  @Query(() => InvoiceConnection, { name: 'invoices' })
  async getInvoices(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('filters', { type: () => InvoiceFilters, nullable: true })
    filters?: InvoiceFilters,
    @Args('pagination', { type: () => PaginationInput, nullable: true })
    pagination?: PaginationInput,
  ): Promise<InvoiceConnection> {
    const query = filters
      ? {
          status: filters.status,
          vendorId: filters.vendorId,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          minAmount: filters.minAmount,
          maxAmount: filters.maxAmount,
        }
      : {};
    const invoices = await this.invoicesService.findAll(tenantId, query);
    
    // Apply pagination
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedInvoices = invoices.slice(start, end);

    return {
      edges: paginatedInvoices.map((invoice) => ({
        node: invoice,
        cursor: invoice.id.toString(),
      })),
      pageInfo: {
        hasNextPage: end < invoices.length,
        hasPreviousPage: page > 1,
        startCursor: paginatedInvoices[0]?.id.toString() || null,
        endCursor: paginatedInvoices[paginatedInvoices.length - 1]?.id.toString() || null,
      },
      totalCount: invoices.length,
    };
  }

  @Query(() => BankTransactionConnection, { name: 'bankTransactions' })
  async getBankTransactions(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('filters', { type: () => BankTransactionFilters, nullable: true })
    filters?: BankTransactionFilters,
    @Args('pagination', { type: () => PaginationInput, nullable: true })
    pagination?: PaginationInput,
  ): Promise<BankTransactionConnection> {
    const query = filters
      ? {
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          minAmount: filters.minAmount,
          maxAmount: filters.maxAmount,
        }
      : {};
    const transactions = await this.bankTransactionsService.findAll(
      tenantId,
      query,
    );

    // Apply pagination
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedTransactions = transactions.slice(start, end);

    return {
      edges: paginatedTransactions.map((transaction) => ({
        node: transaction,
        cursor: transaction.id.toString(),
      })),
      pageInfo: {
        hasNextPage: end < transactions.length,
        hasPreviousPage: page > 1,
        startCursor: paginatedTransactions[0]?.id.toString() || null,
        endCursor:
          paginatedTransactions[paginatedTransactions.length - 1]?.id.toString() ||
          null,
      },
      totalCount: transactions.length,
    };
  }

  @Query(() => [MatchCandidate], { name: 'matchCandidates' })
  async getMatchCandidates(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('filters', { type: () => MatchCandidateFilters, nullable: true })
    filters?: MatchCandidateFilters,
  ): Promise<MatchCandidate[]> {
    // Get reconciliation results
    const result = await this.matchesService.reconcile(tenantId, 10);
    return result.candidates.map((match) => ({
      id: match.id,
      invoiceId: match.invoiceId,
      transactionId: match.bankTransactionId,
      score: match.score,
      status: match.status,
    }));
  }

  @Query(() => ReconciliationExplanation, { name: 'explainReconciliation' })
  async explainReconciliation(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('invoiceId', { type: () => Int }) invoiceId: number,
    @Args('transactionId', { type: () => Int }) transactionId: number,
  ): Promise<ReconciliationExplanation> {
    return this.matchesService.explainReconciliation(
      tenantId,
      invoiceId,
      transactionId,
    );
  }

  // Mutations
  @Mutation(() => Tenant, { name: 'createTenant' })
  async createTenant(
    @Args('input') input: CreateTenantInput,
  ): Promise<Tenant> {
    return this.tenantsService.create(input);
  }

  @Mutation(() => Vendor, { name: 'createVendor' })
  async createVendor(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('input') input: CreateVendorInput,
  ): Promise<Vendor> {
    return this.vendorsService.create(tenantId, input);
  }

  @Mutation(() => Invoice, { name: 'createInvoice' })
  async createInvoice(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('input') input: CreateInvoiceInput,
  ): Promise<Invoice> {
    return this.invoicesService.create(tenantId, input);
  }

  @Mutation(() => Boolean, { name: 'deleteInvoice' })
  async deleteInvoice(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('invoiceId', { type: () => Int }) invoiceId: number,
  ): Promise<boolean> {
    await this.invoicesService.remove(tenantId, invoiceId);
    return true;
  }

  @Mutation(() => ImportBankTransactionsResponse, { name: 'importBankTransactions' })
  async importBankTransactions(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('input') input: ImportBankTransactionsInput,
    @Args('idempotencyKey', { nullable: true, type: () => String })
    idempotencyKey?: string,
  ): Promise<ImportBankTransactionsResponse> {
    const dto = {
      transactions: input.transactions,
      idempotencyKey: idempotencyKey || input.idempotencyKey,
    };
    return this.bankTransactionsService.import(tenantId, dto, idempotencyKey);
  }

  @Mutation(() => ReconcileResponse, { name: 'reconcile' })
  async reconcile(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('input', { nullable: true }) input?: ReconcileInput,
  ): Promise<ReconcileResponse> {
    const topN = input?.topN || 10;
    const result = await this.matchesService.reconcile(tenantId, topN);
    return {
      candidates: result.candidates,
      message: result.message,
    };
  }

  @Mutation(() => Match, { name: 'confirmMatch' })
  async confirmMatch(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('matchId', { type: () => Int }) matchId: number,
  ): Promise<Match> {
    return this.matchesService.confirm(tenantId, matchId);
  }
}

// Response types
@ObjectType()
class ImportBankTransactionsResponse {
  @Field(() => Int)
  imported: number;

  @Field(() => [BankTransaction])
  transactions: BankTransaction[];
}

@ObjectType()
class ReconcileResponse {
  @Field(() => [Match])
  candidates: Match[];

  @Field(() => String, { nullable: true })
  message?: string;
}

