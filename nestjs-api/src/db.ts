import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';
import * as schema from './schema';

config({ path: join(__dirname, '../../.env') });

// Create a connection pool for better performance and connection management
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Default db instance (for backward compatibility, but should use getDbWithContext)
export const db = drizzle(pool, { schema });

// Export pool for direct access when needed
export { pool };
