import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { pool } from '../src/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/schema';
import { eq } from 'drizzle-orm';

/**
 * E2E test to prove that Row Level Security (RLS) blocks cross-tenant access at the database level
 * 
 * This test:
 * 1. Creates two tenants
 * 2. Creates invoices for each tenant
 * 3. Attempts to access tenant 2's invoices using tenant 1's context
 * 4. Verifies that RLS blocks the access at the database level
 */
describe('RLS Multi-Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let tenant1Id: number;
  let tenant2Id: number;
  let invoice1Id: number;
  let invoice2Id: number;
  let vendor1Id: number;
  let vendor2Id: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Setup test data: Create two tenants and invoices
    const db = drizzle(pool, { schema });

    // Create tenants
    const [tenant1] = await db
      .insert(schema.tenants)
      .values({ name: 'Tenant 1 - RLS Test' })
      .returning();
    tenant1Id = tenant1.id;

    const [tenant2] = await db
      .insert(schema.tenants)
      .values({ name: 'Tenant 2 - RLS Test' })
      .returning();
    tenant2Id = tenant2.id;

    // Create vendors for each tenant
    const [vendor1] = await db
      .insert(schema.vendors)
      .values({ tenantId: tenant1Id, name: 'Vendor 1' })
      .returning();
    vendor1Id = vendor1.id;

    const [vendor2] = await db
      .insert(schema.vendors)
      .values({ tenantId: tenant2Id, name: 'Vendor 2' })
      .returning();
    vendor2Id = vendor2.id;

    // Create invoices for tenant 1
    const [invoice1] = await db
      .insert(schema.invoices)
      .values({
        tenantId: tenant1Id,
        vendorId: vendor1Id,
        invoiceNumber: 'INV-T1-TEST-001',
        invoiceDatetime: new Date(),
        amount: 100.0,
        currency: 'USD',
        status: 'OPEN',
      })
      .returning();
    invoice1Id = invoice1.id;

    // Create invoices for tenant 2
    const [invoice2] = await db
      .insert(schema.invoices)
      .values({
        tenantId: tenant2Id,
        vendorId: vendor2Id,
        invoiceNumber: 'INV-T2-TEST-001',
        invoiceDatetime: new Date(),
        amount: 200.0,
        currency: 'USD',
        status: 'OPEN',
      })
      .returning();
    invoice2Id = invoice2.id;
  });

  afterAll(async () => {
    // Cleanup test data
    const db = drizzle(pool, { schema });
    
    // Delete in reverse order of dependencies
    await db.delete(schema.invoices).where(eq(schema.invoices.id, invoice1Id));
    await db.delete(schema.invoices).where(eq(schema.invoices.id, invoice2Id));
    await db.delete(schema.vendors).where(eq(schema.vendors.id, vendor1Id));
    await db.delete(schema.vendors).where(eq(schema.vendors.id, vendor2Id));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant1Id));
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant2Id));

    await app.close();
  });

  describe('RLS blocks cross-tenant access at database level', () => {
    it('should allow tenant 1 to see their own invoices', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenant1Id}/invoices`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      // Verify all returned invoices belong to tenant 1
      response.body.forEach((invoice: any) => {
        expect(invoice.tenantId).toBe(tenant1Id);
      });
    });

    it('should allow tenant 2 to see their own invoices', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenant2Id}/invoices`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      // Verify all returned invoices belong to tenant 2
      response.body.forEach((invoice: any) => {
        expect(invoice.tenantId).toBe(tenant2Id);
      });
    });

    it('should block tenant 1 from accessing tenant 2 invoices via direct DB query with RLS', async () => {
      // Get a connection and set tenant 1's context
      const client = await pool.connect();
      
      try {
        // Set RLS context for tenant 1
        await client.query(`SET app.current_org_id = '${tenant1Id}'`);
        await client.query(`SET app.current_user_id = 'test-user-1'`);
        await client.query(`SET app.is_super_admin = false`);

        // Try to query tenant 2's invoices directly
        // RLS should block this at the database level
        const result = await client.query(
          `SELECT * FROM invoices WHERE tenant_id = $1`,
          [tenant2Id]
        );

        // RLS should filter out tenant 2's invoices
        // So we should get 0 results even though we're querying for tenant 2's ID
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    it('should allow super admin to access all tenants data', async () => {
      // Get a connection and set super admin context
      const client = await pool.connect();
      
      try {
        // Set RLS context for super admin
        await client.query(`SET app.current_org_id = '${tenant1Id}'`);
        await client.query(`SET app.current_user_id = 'super-admin'`);
        await client.query(`SET app.is_super_admin = true`);

        // Super admin should be able to see all invoices
        const result = await client.query(`SELECT * FROM invoices`);

        // Should see invoices from both tenants
        const tenant1Invoices = result.rows.filter((r: any) => r.tenant_id === tenant1Id);
        const tenant2Invoices = result.rows.filter((r: any) => r.tenant_id === tenant2Id);

        expect(tenant1Invoices.length).toBeGreaterThan(0);
        expect(tenant2Invoices.length).toBeGreaterThan(0);
      } finally {
        client.release();
      }
    });

    it('should block tenant 1 from deleting tenant 2 invoices via direct DB query with RLS', async () => {
      // Get a connection and set tenant 1's context
      const client = await pool.connect();
      
      try {
        // Set RLS context for tenant 1
        await client.query(`SET app.current_org_id = '${tenant1Id}'`);
        await client.query(`SET app.current_user_id = 'test-user-1'`);
        await client.query(`SET app.is_super_admin = false`);

        // Try to delete tenant 2's invoice directly
        // RLS should block this at the database level
        const result = await client.query(
          `DELETE FROM invoices WHERE id = $1 RETURNING *`,
          [invoice2Id]
        );

        // RLS should prevent deletion, so we should get 0 rows affected
        expect(result.rows.length).toBe(0);

        // Verify the invoice still exists (by querying as super admin)
        await client.query(`SET app.is_super_admin = true`);
        const verifyResult = await client.query(
          `SELECT * FROM invoices WHERE id = $1`,
          [invoice2Id]
        );
        expect(verifyResult.rows.length).toBe(1);
        expect(verifyResult.rows[0].tenant_id).toBe(tenant2Id);
      } finally {
        client.release();
      }
    });

    it('should block tenant 2 from updating tenant 1 invoices via direct DB query with RLS', async () => {
      // Get a connection and set tenant 2's context
      const client = await pool.connect();
      
      try {
        // Set RLS context for tenant 2
        await client.query(`SET app.current_org_id = '${tenant2Id}'`);
        await client.query(`SET app.current_user_id = 'test-user-2'`);
        await client.query(`SET app.is_super_admin = false`);

        // Try to update tenant 1's invoice directly
        // RLS should block this at the database level
        const result = await client.query(
          `UPDATE invoices SET amount = 999.99 WHERE id = $1 RETURNING *`,
          [invoice1Id]
        );

        // RLS should prevent update, so we should get 0 rows affected
        expect(result.rows.length).toBe(0);

        // Verify the invoice amount is unchanged (by querying as super admin)
        await client.query(`SET app.is_super_admin = true`);
        const verifyResult = await client.query(
          `SELECT * FROM invoices WHERE id = $1`,
          [invoice1Id]
        );
        expect(verifyResult.rows.length).toBe(1);
        expect(parseFloat(verifyResult.rows[0].amount)).toBe(100.0);
      } finally {
        client.release();
      }
    });
  });
});

