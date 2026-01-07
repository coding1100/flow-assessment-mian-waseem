import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { TenantContext } from '../decorators/tenant-context.decorator';
import { tenantContextStorage } from '../storage/tenant-context.storage';
import { pool } from '../../db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../schema';

/**
 * RLS Interceptor that extracts tenant context from request and sets PostgreSQL RLS variables
 * Uses AsyncLocalStorage to make context available throughout the request lifecycle
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RlsInterceptor.name);

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    
    // Extract tenant context from request
    let tenantContext: TenantContext;
    try {
      // Try to get tenantId from route params
      const tenantId = request.params?.tenantId 
        ? parseInt(request.params.tenantId, 10)
        : undefined;

      // Extract user context from JWT token (if authenticated) or headers (fallback)
      const jwtUser = request.user; // Set by JwtAuthGuard
      const userId = jwtUser?.userId || request.headers['x-user-id'] || 'system';
      const orgId = jwtUser?.orgId || request.headers['x-org-id'] || tenantId?.toString() || '0';
      const isSuperAdmin = 
        jwtUser?.isSuperAdmin ||
        request.headers['x-is-super-admin'] === 'true' ||
        request.headers['x-is-super-admin'] === '1' ||
        process.env.SUPER_ADMIN_USER_IDS?.split(',').includes(userId) ||
        false;

      tenantContext = {
        tenantId: tenantId || 0,
        userId,
        orgId,
        isSuperAdmin: !!isSuperAdmin,
      };
    } catch (error) {
      this.logger.warn('Failed to extract tenant context, using defaults', error);
      tenantContext = {
        tenantId: 0,
        userId: 'system',
        orgId: '0',
        isSuperAdmin: false,
      };
    }

    // Store tenant context in request for backward compatibility
    request.tenantContext = tenantContext;

    // Get a connection from the pool and set RLS context
    const client = await pool.connect();
    
    try {
      // Escape single quotes to prevent SQL injection
      // Note: userId and orgId are always defined here due to defaults set above
      const safeUserId = (tenantContext.userId || 'system').replace(/'/g, "''");
      const safeOrgId = (tenantContext.orgId || tenantContext.tenantId.toString()).replace(/'/g, "''");
      const isSuperAdminStr = tenantContext.isSuperAdmin ? 'true' : 'false';

      // Set context variables for Row Level Security
      await client.query(`SET app.current_user_id = '${safeUserId}'`);
      await client.query(`SET app.current_org_id = '${safeOrgId}'`);
      await client.query(`SET app.is_super_admin = ${isSuperAdminStr}`);

      // Create a Drizzle instance using this client with RLS context set
      const db = drizzle(client, { schema });
      
      // Store db and client in request so services can use them
      request.db = db;
      request.dbClient = client;

      this.logger.debug(
        `RLS context set: tenantId=${tenantContext.tenantId}, userId=${tenantContext.userId}, orgId=${tenantContext.orgId}, isSuperAdmin=${tenantContext.isSuperAdmin}`,
      );

      // Run the rest of the request in AsyncLocalStorage context
      return tenantContextStorage.run(tenantContext, () => {
        return next.handle().pipe(
          finalize(() => {
            // Release connection back to pool when request completes
            client.release();
          }),
        );
      });
    } catch (error) {
      // Release connection on error
      client.release();
      this.logger.error('Failed to set RLS context', error);
      throw error;
    }
  }
}

