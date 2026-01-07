import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { and, between, eq, gte, lte, count } from 'drizzle-orm';
import { invoices } from '../schema';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQuery } from './dto/list-invoices.query';
import { DatabaseService } from '../common/services/database.service';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Generates a unique invoice number with format: INV-{tenantId}-{YYYYMMDD}-{sequence}
   * where sequence is the count of invoices created today for this tenant + 1
   */
  private async generateInvoiceNumber(tenantId: number): Promise<string> {
    const db = this.databaseService.getDb();
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

    // Count invoices created today for this tenant
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const [result] = await db
      .select({ count: count() })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          gte(invoices.createdAt, startOfDay),
          lte(invoices.createdAt, endOfDay),
        ),
      );

    const sequence = (result?.count || 0) + 1;
    const sequenceStr = sequence.toString().padStart(4, '0'); // Pad to 4 digits

    return `INV-${tenantId}-${dateStr}-${sequenceStr}`;
  }

  async create(tenantId: number, dto: CreateInvoiceDto) {
    const db = this.databaseService.getDb();
    try {
      // Generate unique invoice number
      const invoiceNumber = await this.generateInvoiceNumber(tenantId);

      // Build values object with explicit defaults to match schema
      const values = {
        tenantId,
        vendorId: dto.vendorId,
        invoiceNumber,
        invoiceDatetime: new Date(dto.invoiceDatetime),
        amount: dto.amount,
        // Use provided value or schema default
        currency: dto.currency ?? 'USD',
        status: dto.status ?? 'OEPN',
        // Description can be null, so only set if provided
        ...(dto.description !== undefined && { description: dto.description }),
      };

      const [invoice] = await db.insert(invoices).values(values).returning();
      return invoice;
    } catch (error: any) {
      // Log full error details for debugging
      this.logger.error(
        `Failed to create invoice for tenant ${tenantId}`,
        {
          message: error.message,
          code: error.code,
          detail: error.detail,
          constraint: error.constraint,
          cause: error.cause,
          stack: error.stack,
        },
      );

      // Extract error code - check cause first since drizzle wraps PostgreSQL errors
      const pgError = error.cause || error;
      const errorCode = pgError.code || error.code || error?.originalError?.code;
      const errorMessage = pgError.message || error.message;
      const errorDetail = pgError.detail || error.detail;

      // Handle foreign key violations
      if (errorCode === '23503') {
        throw new BadRequestException('Invalid vendor or tenant ID');
      }

      // Handle unique constraint violations (shouldn't happen with our generation, but just in case)
      if (errorCode === '23505') {
        // Retry with a new invoice number if collision occurs
        this.logger.warn(
          `Invoice number collision detected for tenant ${tenantId}, retrying...`,
        );
        try {
          // Add a small random component to avoid immediate collision
          const timestamp = Date.now().toString().slice(-6);
          const invoiceNumber = `INV-${tenantId}-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${timestamp}`;
          
          const retryValues = {
            tenantId,
            vendorId: dto.vendorId,
            invoiceNumber,
            invoiceDatetime: new Date(dto.invoiceDatetime),
            amount: dto.amount,
            currency: dto.currency ?? 'USD',
            status: dto.status ?? 'OEPN',
            ...(dto.description !== undefined && { description: dto.description }),
          };
          
          const [invoice] = await this.databaseService.getDb()
            .insert(invoices)
            .values(retryValues)
            .returning();
          return invoice;
        } catch (retryError: any) {
          this.logger.error(
            `Retry also failed for tenant ${tenantId}`,
            retryError.stack,
          );
          throw new BadRequestException('Failed to generate unique invoice number');
        }
      }

      // Handle not null violations
      if (errorCode === '23502') {
        // Extract which field is missing from the error detail
        if (errorDetail && errorDetail.includes('currency')) {
          throw new BadRequestException('Currency field is required');
        }
        if (errorDetail && errorDetail.includes('status')) {
          throw new BadRequestException('Status field is required');
        }
        throw new BadRequestException(
          errorDetail || 'Required field is missing',
        );
      }

      // Handle check constraint violations
      if (errorCode === '23514') {
        throw new BadRequestException('Data violates business rules');
      }

      // Handle connection/query errors (drizzle wraps PostgreSQL errors)
      if (errorMessage && errorMessage.includes('Failed query')) {
        // Check the actual PostgreSQL error in cause
        if (errorDetail) {
          if (errorDetail.includes('foreign key')) {
            throw new BadRequestException('Invalid vendor or tenant ID');
          }
          if (
            errorDetail.includes('unique constraint') ||
            errorDetail.includes('duplicate key')
          ) {
            // Retry with timestamp-based invoice number
            this.logger.warn(
              `Invoice number collision detected for tenant ${tenantId}, retrying with timestamp...`,
            );
            try {
              const timestamp = Date.now().toString().slice(-6);
              const invoiceNumber = `INV-${tenantId}-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${timestamp}`;

              // Build values again for retry with defaults
              const retryValues = {
                tenantId,
                vendorId: dto.vendorId,
                invoiceNumber,
                invoiceDatetime: new Date(dto.invoiceDatetime),
                amount: dto.amount,
                currency: dto.currency ?? 'USD',
                status: dto.status ?? 'OEPN',
                ...(dto.description !== undefined && { description: dto.description }),
              };

              const [invoice] = await this.databaseService.getDb()
                .insert(invoices)
                .values(retryValues)
                .returning();
              return invoice;
            } catch (retryError: any) {
              throw new BadRequestException('Failed to generate unique invoice number');
            }
          }
          if (errorDetail.includes('null value') && errorDetail.includes('currency')) {
            throw new BadRequestException('Currency field cannot be null');
          }
          if (errorDetail.includes('null value') && errorDetail.includes('status')) {
            throw new BadRequestException('Status field cannot be null');
          }
        }
        // Generic database error
        throw new BadRequestException(
          errorDetail || errorMessage || 'Database error occurred',
        );
      }

      // Re-throw for other errors (will be caught by global exception filter)
      throw error;
    }
  }

  async findAll(tenantId: number, query: ListInvoicesQuery) {
    const db = this.databaseService.getDb();
    try {
      const conditions = [eq(invoices.tenantId, tenantId)];

      if (query.status) {
        conditions.push(eq(invoices.status, query.status));
      }

      if (query.vendorId != null) {
        conditions.push(eq(invoices.vendorId, query.vendorId));
      }

      if (query.fromDate && query.toDate) {
        conditions.push(
          between(
            invoices.invoiceDatetime,
            new Date(query.fromDate),
            new Date(query.toDate),
          ),
        );
      } else if (query.fromDate) {
        conditions.push(gte(invoices.invoiceDatetime, new Date(query.fromDate)));
      } else if (query.toDate) {
        conditions.push(lte(invoices.invoiceDatetime, new Date(query.toDate)));
      }

      if (query.minAmount != null && query.maxAmount != null) {
        conditions.push(
          between(invoices.amount, query.minAmount, query.maxAmount),
        );
      } else if (query.minAmount != null) {
        conditions.push(gte(invoices.amount, query.minAmount));
      } else if (query.maxAmount != null) {
        conditions.push(lte(invoices.amount, query.maxAmount));
      }

      return await db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(invoices.id);
    } catch (error: any) {
      this.logger.error(
        `Failed to find invoices for tenant ${tenantId}`,
        error.stack,
      );
      throw error;
    }
  }

  async remove(tenantId: number, id: number) {
    const db = this.databaseService.getDb();
    try {
      const result = await db
        .delete(invoices)
        .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, id)))
        .returning();

      if (!result.length) {
        throw new NotFoundException('Invoice not found');
      }

      return { deleted: true };
    } catch (error: any) {
      // If it's already a NestJS exception, re-throw it
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to delete invoice ${id} for tenant ${tenantId}`,
        error.stack,
      );

      // Handle foreign key violations (e.g., invoice is referenced in matches)
      if (error.code === '23503') {
        throw new BadRequestException(
          'Cannot delete invoice: it is referenced by other records',
        );
      }

      throw error;
    }
  }
}


