import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import {
  matches,
  invoices,
  bankTransactions,
  vendors,
  tenants,
} from '../schema';
import {
  AiExplanationService,
  ExplanationResult,
} from '../common/services/ai-explanation.service';

interface GraphQLResponse {
  data?: {
    scoreCandidates?: Array<{
      invoiceId: number;
      transactionId: number;
      score: number;
      explanations: string[];
    }>;
  };
  errors?: Array<{ message: string }>;
}

export interface Candidate {
  invoice_id: number;
  transaction_id: number;
  score: number;
  explanations: string[];
}

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);
  private readonly pythonEngineUrl: string;

  constructor(
    private configService: ConfigService,
    private aiExplanationService: AiExplanationService,
  ) {
    this.pythonEngineUrl =
      this.configService.get<string>('PYTHON_ENGINE_URL') ||
      'http://localhost:8000';
  }

  /**
   * Ensure tenant exists
   */
  private async ensureTenantExists(tenantId: number): Promise<void> {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }
  }

  /**
   * Fetch invoices with vendor names for a tenant
   */
  private async fetchInvoices(tenantId: number) {
    const invoiceList = await db
      .select({
        id: invoices.id,
        vendor_id: invoices.vendorId,
        invoice_number: invoices.invoiceNumber,
        invoice_datetime: invoices.invoiceDatetime,
        amount: invoices.amount,
        currency: invoices.currency,
        description: invoices.description,
        vendor_name: vendors.name,
      })
      .from(invoices)
      .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
      .where(eq(invoices.tenantId, tenantId));

    return invoiceList;
  }

  /**
   * Fetch bank transactions for a tenant
   */
  private async fetchBankTransactions(tenantId: number) {
    return await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.tenantId, tenantId));
  }

  /**
   * Call Python GraphQL endpoint for reconciliation
   */
  private async callPythonGraphQL(
    tenantId: number,
    invoices: any[],
    transactions: any[],
    topN: number,
  ): Promise<Candidate[]> {
    const graphqlQuery = {
      query: `
        query ScoreCandidates($tenantId: Int!, $invoices: [InvoiceInput!]!, $transactions: [BankTransactionInput!]!, $topN: Int!) {
          scoreCandidates(
            tenantId: $tenantId
            invoices: $invoices
            transactions: $transactions
            topN: $topN
          ) {
            invoiceId
            transactionId
            score
            explanations
          }
        }
      `,
      variables: {
        tenantId,
        invoices: invoices.map((inv) => ({
          id: inv.id,
          vendorId: inv.vendor_id,
          invoiceNumber: inv.invoice_number,
          invoiceDatetime: new Date(inv.invoice_datetime).toISOString(),
          amount: Number(inv.amount),
          currency: inv.currency || 'USD',
          description: inv.description || null,
          vendorName: inv.vendor_name || null,
        })),
        transactions: transactions.map((tx) => ({
          id: tx.id,
          externalId: tx.externalId,
          postedAt: new Date(tx.postedAt).toISOString(),
          amount: Number(tx.amount),
          currency: tx.currency || 'USD',
          description: tx.description || null,
        })),
        topN,
      },
    };

    try {
      const response = await fetch(`${this.pythonEngineUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(graphqlQuery),
      });

      if (!response.ok) {
        throw new HttpException(
          `Python engine returned status ${response.status}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const result: GraphQLResponse = await response.json();

      if (result.errors && result.errors.length > 0) {
        this.logger.error('GraphQL errors from Python engine', result.errors);
        throw new HttpException(
          `GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (!result.data?.scoreCandidates) {
        return [];
      }

      return result.data.scoreCandidates.map((cand) => ({
        invoice_id: cand.invoiceId,
        transaction_id: cand.transactionId,
        score: cand.score,
        explanations: cand.explanations,
      }));
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Failed to call Python GraphQL endpoint: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to communicate with reconciliation engine',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Store proposed matches in the database
   */
  private async storeMatches(
    tenantId: number,
    candidates: Candidate[],
  ): Promise<any[]> {
    // Delete all existing PROPOSED matches for this tenant
    // (we'll replace them with new reconciliation results)
    await db
      .delete(matches)
      .where(
        and(eq(matches.tenantId, tenantId), eq(matches.status, 'PROPOSED')),
      );

    // Prepare matches to insert
    const matchesToInsert = candidates.map((cand) => ({
      tenantId,
      invoiceId: cand.invoice_id,
      bankTransactionId: cand.transaction_id,
      score: cand.score,
      status: 'PROPOSED',
    }));

    // Insert new proposed matches
    // Use insert with onConflictDoUpdate if available, otherwise handle duplicates
    const insertedMatches: any[] = [];
    for (const match of matchesToInsert) {
      try {
        // Check if a match (in any status) already exists for this pair
        const [existing] = await db
          .select()
          .from(matches)
          .where(
            and(
              eq(matches.tenantId, tenantId),
              eq(matches.invoiceId, match.invoiceId),
              eq(matches.bankTransactionId, match.bankTransactionId),
            ),
          )
          .limit(1);

        if (existing) {
          // Update existing match only if it's PROPOSED
          // (don't overwrite CONFIRMED matches)
          if (existing.status === 'PROPOSED') {
            const [updated] = await db
              .update(matches)
              .set({
                score: match.score,
                status: 'PROPOSED',
              })
              .where(eq(matches.id, existing.id))
              .returning();
            insertedMatches.push(updated);
          }
          // Skip if match is already CONFIRMED
        } else {
          // Insert new match
          const [inserted] = await db
            .insert(matches)
            .values(match)
            .returning();
          insertedMatches.push(inserted);
        }
      } catch (error: any) {
        // Handle unique constraint violations (concurrent inserts)
        if (error.code === '23505') {
          this.logger.warn(
            `Match already exists for invoice ${match.invoiceId} and transaction ${match.bankTransactionId}`,
          );
          // Try to fetch the existing match
          const [existing] = await db
            .select()
            .from(matches)
            .where(
              and(
                eq(matches.tenantId, tenantId),
                eq(matches.invoiceId, match.invoiceId),
                eq(matches.bankTransactionId, match.bankTransactionId),
              ),
            )
            .limit(1);
          if (existing) {
            insertedMatches.push(existing);
          }
        } else {
          this.logger.error(
            `Failed to store match for invoice ${match.invoiceId} and transaction ${match.bankTransactionId}`,
            error.message,
          );
        }
      }
    }

    return insertedMatches;
  }

  /**
   * Reconcile invoices with bank transactions
   */
  async reconcile(
    tenantId: number,
    topN: number = 10,
  ): Promise<{
    candidates: any[];
    byInvoice: Record<number, Candidate[]>;
    byTransaction: Record<number, Candidate[]>;
    message?: string;
  }> {
    try {
      await this.ensureTenantExists(tenantId);

      // Fetch invoices and transactions
      const invoiceList = await this.fetchInvoices(tenantId);
      const transactionList = await this.fetchBankTransactions(tenantId);

      if (invoiceList.length === 0) {
        return {
          message: 'No invoices found for this tenant',
          candidates: [],
          byInvoice: {},
          byTransaction: {},
        };
      }

      if (transactionList.length === 0) {
        return {
          message: 'No bank transactions found for this tenant',
          candidates: [],
          byInvoice: {},
          byTransaction: {},
        };
      }

      // Call Python GraphQL endpoint
      const candidates = await this.callPythonGraphQL(
        tenantId,
        invoiceList,
        transactionList,
        topN * 10, // Get more candidates to ensure we have top N per invoice/transaction
      );

      // Store matches in database
      const storedMatches = await this.storeMatches(tenantId, candidates);

      // Group candidates by invoice and transaction
      const byInvoice: Record<number, Candidate[]> = {};
      const byTransaction: Record<number, Candidate[]> = {};

      for (const cand of candidates) {
        // Best candidate per invoice
        if (!byInvoice[cand.invoice_id]) {
          byInvoice[cand.invoice_id] = [];
        }
        byInvoice[cand.invoice_id].push(cand);

        // Best candidate per transaction
        if (!byTransaction[cand.transaction_id]) {
          byTransaction[cand.transaction_id] = [];
        }
        byTransaction[cand.transaction_id].push(cand);
      }

      // Sort and limit to top N for each
      for (const invoiceId in byInvoice) {
        byInvoice[invoiceId]
          .sort((a, b) => b.score - a.score)
          .splice(topN);
      }

      for (const transactionId in byTransaction) {
        byTransaction[transactionId]
          .sort((a, b) => b.score - a.score)
          .splice(topN);
      }

      return {
        candidates: storedMatches,
        byInvoice,
        byTransaction,
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof HttpException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to reconcile for tenant ${tenantId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Confirm a proposed match
   */
  async confirm(tenantId: number, matchId: number) {
    try {
      await this.ensureTenantExists(tenantId);

      // Find the match
      const [match] = await db
        .select()
        .from(matches)
        .where(
          and(eq(matches.id, matchId), eq(matches.tenantId, tenantId)),
        )
        .limit(1);

      if (!match) {
        throw new NotFoundException(
          `Match with ID ${matchId} not found for tenant ${tenantId}`,
        );
      }

      if (match.status !== 'PROPOSED') {
        throw new BadRequestException(
          `Match with ID ${matchId} is not in PROPOSED status (current: ${match.status})`,
        );
      }

      // Update match status to CONFIRMED
      const [updated] = await db
        .update(matches)
        .set({ status: 'CONFIRMED' })
        .where(eq(matches.id, matchId))
        .returning();

      return updated;
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to confirm match ${matchId} for tenant ${tenantId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Explain reconciliation for a specific invoice-transaction pair
   */
  async explainReconciliation(
    tenantId: number,
    invoiceId: number,
    transactionId: number,
  ): Promise<{ score: number; explanations: string[] }> {
    try {
      await this.ensureTenantExists(tenantId);

      // Fetch the specific invoice and transaction
      const [invoice] = await db
        .select({
          id: invoices.id,
          vendor_id: invoices.vendorId,
          invoice_number: invoices.invoiceNumber,
          invoice_datetime: invoices.invoiceDatetime,
          amount: invoices.amount,
          currency: invoices.currency,
          description: invoices.description,
          vendor_name: vendors.name,
        })
        .from(invoices)
        .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
        .where(
          and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)),
        )
        .limit(1);

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found for tenant ${tenantId}`,
        );
      }

      const [transaction] = await db
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, transactionId),
            eq(bankTransactions.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!transaction) {
        throw new NotFoundException(
          `Bank transaction with ID ${transactionId} not found for tenant ${tenantId}`,
        );
      }

      // Call Python GraphQL endpoint with just this pair
      const candidates = await this.callPythonGraphQL(
        tenantId,
        [
          {
            id: invoice.id,
            vendor_id: invoice.vendor_id,
            invoice_number: invoice.invoice_number,
            invoice_datetime: invoice.invoice_datetime,
            amount: Number(invoice.amount),
            currency: invoice.currency || 'USD',
            description: invoice.description || null,
            vendor_name: invoice.vendor_name || null,
          },
        ],
        [
          {
            id: transaction.id,
            externalId: transaction.externalId,
            postedAt: transaction.postedAt,
            amount: Number(transaction.amount),
            currency: transaction.currency || 'USD',
            description: transaction.description || null,
          },
        ],
        1, // topN = 1 since we only want this specific pair
      );

      if (candidates.length === 0) {
        return {
          score: 0,
          explanations: ['No match found between this invoice and transaction'],
        };
      }

      const candidate = candidates[0];
      return {
        score: candidate.score,
        explanations: candidate.explanations,
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof HttpException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to explain reconciliation for invoice ${invoiceId} and transaction ${transactionId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Generate AI-powered explanation for a reconciliation match
   */
  async explainMatch(
    tenantId: number,
    invoiceId: number,
    transactionId: number,
  ): Promise<ExplanationResult> {
    try {
      await this.ensureTenantExists(tenantId);

      // Fetch the specific invoice and transaction with tenant authorization
      const [invoice] = await db
        .select({
          id: invoices.id,
          vendor_id: invoices.vendorId,
          invoice_number: invoices.invoiceNumber,
          invoice_datetime: invoices.invoiceDatetime,
          amount: invoices.amount,
          currency: invoices.currency,
          description: invoices.description,
          vendor_name: vendors.name,
        })
        .from(invoices)
        .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
        .where(
          and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)),
        )
        .limit(1);

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found for tenant ${tenantId}`,
        );
      }

      const [transaction] = await db
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, transactionId),
            eq(bankTransactions.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!transaction) {
        throw new NotFoundException(
          `Bank transaction with ID ${transactionId} not found for tenant ${tenantId}`,
        );
      }

      // Get heuristic score and explanations from Python engine
      let heuristicScore = 0;
      let heuristicExplanations: string[] = [];

      try {
        const candidates = await this.callPythonGraphQL(
          tenantId,
          [
            {
              id: invoice.id,
              vendor_id: invoice.vendor_id,
              invoice_number: invoice.invoice_number,
              invoice_datetime: invoice.invoice_datetime,
              amount: Number(invoice.amount),
              currency: invoice.currency || 'USD',
              description: invoice.description || null,
              vendor_name: invoice.vendor_name || null,
            },
          ],
          [
            {
              id: transaction.id,
              externalId: transaction.externalId,
              postedAt: transaction.postedAt,
              amount: Number(transaction.amount),
              currency: transaction.currency || 'USD',
              description: transaction.description || null,
            },
          ],
          1, // topN = 1 since we only want this specific pair
        );

        if (candidates.length > 0) {
          heuristicScore = candidates[0].score;
          heuristicExplanations = candidates[0].explanations;
        }
      } catch (error: any) {
        this.logger.warn(
          `Failed to get heuristic score from Python engine: ${error.message}`,
        );
        // Continue with fallback - we'll compute a basic score
        const amountDiff = Math.abs(
          Number(invoice.amount) - Number(transaction.amount),
        );
        const amountMatch =
          invoice.amount > 0
            ? 1 - amountDiff / Math.max(invoice.amount, transaction.amount)
            : 0;
        heuristicScore = Math.max(0, Math.min(1, amountMatch));
        heuristicExplanations = [
          `Amount difference: ${amountDiff.toFixed(2)}`,
        ];
      }

      // Prepare context for AI explanation
      const context = {
        invoice: {
          amount: Number(invoice.amount),
          date: invoice.invoice_datetime
            ? new Date(invoice.invoice_datetime).toISOString().split('T')[0]
            : '',
          vendor: invoice.vendor_name || 'Unknown',
          description: invoice.description || null,
        },
        transaction: {
          amount: Number(transaction.amount),
          date: transaction.postedAt
            ? new Date(transaction.postedAt).toISOString().split('T')[0]
            : '',
          description: transaction.description || null,
        },
        heuristicScore,
        heuristicExplanations,
      };

      // Generate explanation (AI with fallback)
      return await this.aiExplanationService.generateExplanation(context);
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof HttpException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to explain match for invoice ${invoiceId} and transaction ${transactionId}`,
        error.stack,
      );
      throw error;
    }
  }
}

