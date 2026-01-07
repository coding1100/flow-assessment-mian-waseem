import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, and, between, gte, lte } from 'drizzle-orm';
import { createHash } from 'crypto';
import { db } from '../db';
import {
  bankTransactions,
  idempotencyKeys,
  tenants,
} from '../schema';
import { ImportBankTransactionsDto } from './dto/import-bank-transactions.dto';
import { BankTransactionItemDto } from './dto/bank-transaction-item.dto';

@Injectable()
export class BankTransactionsService {
  private readonly logger = new Logger(BankTransactionsService.name);

  /**
   * Generate a SHA-256 hash of the payload for idempotency checking
   */
  private hashPayload(payload: unknown): string {
    const payloadString = JSON.stringify(payload);
    return createHash('sha256').update(payloadString).digest('hex');
  }

  /**
   * Check if tenant exists
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
   * Get idempotency key from header or DTO
   */
  private getIdempotencyKey(
    headerKey: string | undefined,
    dtoKey: string | undefined,
  ): string | null {
    return headerKey || dtoKey || null;
  }

  /**
   * Check idempotency and return cached response if exists
   */
  private async checkIdempotency(
    tenantId: number,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<{ cached: boolean; response?: any }> {
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.tenantId, tenantId),
          eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    if (!existing) {
      return { cached: false };
    }

    // If same key but different payload, throw conflict
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException(
        `Idempotency key '${idempotencyKey}' was already used with a different payload`,
      );
    }

    // Same key and same payload - return cached response
    return {
      cached: true,
      response: JSON.parse(existing.response),
    };
  }

  /**
   * Store idempotency key and response
   */
  private async storeIdempotencyKey(
    tenantId: number,
    idempotencyKey: string,
    payloadHash: string,
    response: any,
  ): Promise<void> {
    try {
      await db.insert(idempotencyKeys).values({
        tenantId,
        idempotencyKey,
        payloadHash,
        response: JSON.stringify(response),
      });
    } catch (error: any) {
      // If there's a unique constraint violation, it means another request
      // completed first - this is fine, we can ignore it
      if (error.code === '23505') {
        this.logger.warn(
          `Idempotency key ${idempotencyKey} was stored by concurrent request`,
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Import bank transactions in bulk
   */
  async import(
    tenantId: number,
    dto: ImportBankTransactionsDto,
    idempotencyKeyHeader?: string,
  ) {
    try {
      // Ensure tenant exists
      await this.ensureTenantExists(tenantId);

      // Get idempotency key from header or DTO
      const idempotencyKey = this.getIdempotencyKey(
        idempotencyKeyHeader,
        dto.idempotencyKey,
      );

      // If idempotency key is provided, check for existing request
      if (idempotencyKey) {
        const payloadHash = this.hashPayload(dto.transactions);

        const idempotencyCheck = await this.checkIdempotency(
          tenantId,
          idempotencyKey,
          payloadHash,
        );

        if (idempotencyCheck.cached) {
          this.logger.log(
            `Returning cached response for idempotency key: ${idempotencyKey}`,
          );
          return idempotencyCheck.response;
        }
      }

      // Validate transactions array is not empty
      if (!dto.transactions || dto.transactions.length === 0) {
        throw new BadRequestException('Transactions array cannot be empty');
      }

      // Prepare transactions for insertion
      const transactionsToInsert = dto.transactions.map((tx) => ({
        tenantId,
        externalId: tx.externalId,
        postedAt: new Date(tx.postedAt),
        amount: tx.amount,
        currency: tx.currency ?? 'USD',
        description: tx.description ?? null,
      }));

      // Insert all transactions
      const insertedTransactions = await db
        .insert(bankTransactions)
        .values(transactionsToInsert)
        .returning();

      const response = {
        imported: insertedTransactions.length,
        transactions: insertedTransactions,
      };

      // Store idempotency key if provided
      if (idempotencyKey) {
        const payloadHash = this.hashPayload(dto.transactions);
        await this.storeIdempotencyKey(
          tenantId,
          idempotencyKey,
          payloadHash,
          response,
        );
      }

      return response;
    } catch (error: any) {
      // Re-throw NestJS exceptions as-is
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to import bank transactions for tenant ${tenantId}`,
        {
          message: error.message,
          code: error.code,
          detail: error.detail,
          constraint: error.constraint,
          stack: error.stack,
        },
      );

      // Handle foreign key violations
      const pgError = error.cause || error;
      const errorCode = pgError.code || error.code;

      if (errorCode === '23503') {
        throw new BadRequestException('Invalid tenant ID');
      }

      if (errorCode === '23505') {
        throw new BadRequestException(
          'Duplicate external ID found in transactions',
        );
      }

      if (errorCode === '23502') {
        throw new BadRequestException('Required field is missing');
      }

      throw error;
    }
  }

  /**
   * Find all bank transactions for a tenant with optional filters
   */
  async findAll(
    tenantId: number,
    filters?: {
      fromDate?: string;
      toDate?: string;
      minAmount?: number;
      maxAmount?: number;
    },
  ) {
    try {
      await this.ensureTenantExists(tenantId);

      const conditions = [eq(bankTransactions.tenantId, tenantId)];

      if (filters?.fromDate && filters?.toDate) {
        conditions.push(
          between(
            bankTransactions.postedAt,
            new Date(filters.fromDate),
            new Date(filters.toDate),
          ),
        );
      } else if (filters?.fromDate) {
        conditions.push(
          gte(bankTransactions.postedAt, new Date(filters.fromDate)),
        );
      } else if (filters?.toDate) {
        conditions.push(
          lte(bankTransactions.postedAt, new Date(filters.toDate)),
        );
      }

      if (filters?.minAmount != null && filters?.maxAmount != null) {
        conditions.push(
          between(
            bankTransactions.amount,
            filters.minAmount,
            filters.maxAmount,
          ),
        );
      } else if (filters?.minAmount != null) {
        conditions.push(gte(bankTransactions.amount, filters.minAmount));
      } else if (filters?.maxAmount != null) {
        conditions.push(lte(bankTransactions.amount, filters.maxAmount));
      }

      return await db
        .select()
        .from(bankTransactions)
        .where(and(...conditions))
        .orderBy(bankTransactions.id);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to find bank transactions for tenant ${tenantId}`,
        error.stack,
      );
      throw error;
    }
  }
}

