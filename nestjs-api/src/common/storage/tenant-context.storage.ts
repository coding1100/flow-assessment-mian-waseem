import { AsyncLocalStorage } from 'async_hooks';
import { TenantContext } from '../decorators/tenant-context.decorator';

/**
 * AsyncLocalStorage for tenant context
 * This allows us to access tenant context from anywhere in the request lifecycle
 */
export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Gets the current tenant context from AsyncLocalStorage
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

