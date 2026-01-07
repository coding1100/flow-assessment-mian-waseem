import { Injectable, Logger, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { db } from '../../db';
import * as schema from '../../schema';

/**
 * Database service that provides access to the database instance
 * Automatically uses request-scoped db (with RLS context) if available,
 * otherwise falls back to the global db instance
 */
@Injectable({ scope: Scope.REQUEST })
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(REQUEST) private readonly request: any) {}

  /**
   * Gets the database instance
   * If RLS interceptor has set request.db, use that (has RLS context)
   * Otherwise, use the global db instance (for backward compatibility)
   */
  getDb(): NodePgDatabase<typeof schema> {
    // If RLS interceptor has set a request-scoped db, use it
    if (this.request?.db) {
      return this.request.db;
    }
    
    // Fall back to global db (for cases where interceptor didn't run)
    // Note: This won't have RLS context, so it's not ideal
    this.logger.warn('Using global db instance without RLS context. Ensure RlsInterceptor is registered.');
    return db;
  }
}

