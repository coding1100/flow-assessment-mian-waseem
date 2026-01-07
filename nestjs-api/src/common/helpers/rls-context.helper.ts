import { pool } from '../../db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../schema';
import { TenantContext } from '../decorators/tenant-context.decorator';

/**
 * Helper function to set RLS context for GraphQL resolvers or other cases
 * where tenant context is not available from route params
 * 
 * @param tenantContext - The tenant context to set
 * @returns A database instance with RLS context set
 */
export async function setRlsContextForRequest(
  tenantContext: TenantContext,
  request: any,
): Promise<{ db: ReturnType<typeof drizzle<typeof schema>>; client: any }> {
  // If RLS context is already set for this request, reuse it
  if (request?.db && request?.dbClient) {
    // Update the context variables if tenant context changed
    const safeUserId = (tenantContext.userId || 'system').replace(/'/g, "''");
    const safeOrgId = (tenantContext.orgId || tenantContext.tenantId.toString()).replace(/'/g, "''");
    const isSuperAdminStr = tenantContext.isSuperAdmin ? 'true' : 'false';

    await request.dbClient.query(`SET app.current_user_id = '${safeUserId}'`);
    await request.dbClient.query(`SET app.current_org_id = '${safeOrgId}'`);
    await request.dbClient.query(`SET app.is_super_admin = ${isSuperAdminStr}`);

    return { db: request.db, client: request.dbClient };
  }

  // Otherwise, get a new connection and set context
  const client = await pool.connect();

  try {
    // Escape single quotes to prevent SQL injection
    const safeUserId = (tenantContext.userId || 'system').replace(/'/g, "''");
    const safeOrgId = (tenantContext.orgId || tenantContext.tenantId.toString()).replace(/'/g, "''");
    const isSuperAdminStr = tenantContext.isSuperAdmin ? 'true' : 'false';

    // Set context variables for Row Level Security
    await client.query(`SET app.current_user_id = '${safeUserId}'`);
    await client.query(`SET app.current_org_id = '${safeOrgId}'`);
    await client.query(`SET app.is_super_admin = ${isSuperAdminStr}`);

    // Create a Drizzle instance using this client with RLS context set
    const db = drizzle(client, { schema });

    // Store in request for reuse
    if (request) {
      request.db = db;
      request.dbClient = client;
    }

    return { db, client };
  } catch (error) {
    // Release connection on error
    client.release();
    throw error;
  }
}

