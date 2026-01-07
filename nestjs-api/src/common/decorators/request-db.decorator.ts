import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../schema';

/**
 * Decorator to get the database instance from request
 * This db instance has RLS context set by the RlsInterceptor
 */
export const RequestDb = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): NodePgDatabase<typeof schema> | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.db;
  },
);

