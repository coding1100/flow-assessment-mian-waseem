import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface TenantContext {
  tenantId: number;
  userId?: string;
  orgId?: string;
  isSuperAdmin?: boolean;
}

/**
 * Decorator to extract tenant context from request
 * Looks for tenantId in route params, userId in headers (X-User-Id), 
 * orgId in headers (X-Org-Id), and isSuperAdmin in headers (X-Is-Super-Admin)
 */
export const TenantContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    
    // Extract tenantId from route params (most common case)
    const tenantId = request.params?.tenantId 
      ? parseInt(request.params.tenantId, 10)
      : undefined;

    // Extract user context from headers
    const userId = request.headers['x-user-id'] || request.headers['x-user-id'] || undefined;
    const orgId = request.headers['x-org-id'] || request.headers['x-org-id'] || undefined;
    const isSuperAdmin = 
      request.headers['x-is-super-admin'] === 'true' ||
      request.headers['x-is-super-admin'] === '1' ||
      process.env.SUPER_ADMIN_USER_IDS?.split(',').includes(userId || '') ||
      false;

    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    return {
      tenantId,
      userId: userId || 'system',
      orgId: orgId || tenantId.toString(),
      isSuperAdmin: !!isSuperAdmin,
    };
  },
);

