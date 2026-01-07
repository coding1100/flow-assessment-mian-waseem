import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  doublePrecision,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Tenants
export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Vendors
export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Invoices
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id),
  vendorId: integer('vendor_id')
    .notNull()
    .references(() => vendors.id),
  invoiceNumber: varchar('invoice_number', { length: 255 }).notNull(),
  invoiceDatetime: timestamp('invoice_datetime', { withTimezone: true }).notNull(),
  amount: doublePrecision('amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  description: varchar('description', { length: 255 }),
  status: varchar('status', { length: 255 }).notNull().default('OEPN'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Bank transactions
export const bankTransactions = pgTable('bank_transactions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
  amount: doublePrecision('amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Matches
export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .notNull()
    .references(() => tenants.id),
  bankTransactionId: integer('bank_transaction_id')
    .notNull()
    .references(() => bankTransactions.id),
  invoiceId: integer('invoice_id')
    .notNull()
    .references(() => invoices.id),
  score: doublePrecision('score').notNull(),
  status: varchar('status', { length: 255 }).notNull().default('PROPOSED'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Idempotency keys
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
    response: text('response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    tenantIdempotencyKeyUnique: unique().on(table.tenantId, table.idempotencyKey),
  }),
);

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  vendors: many(vendors),
  invoices: many(invoices),
  bankTransactions: many(bankTransactions),
  matches: many(matches),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [vendors.tenantId],
    references: [tenants.id],
  }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),
  vendor: one(vendors, {
    fields: [invoices.vendorId],
    references: [vendors.id],
  }),
  matches: many(matches),
}));

export const bankTransactionsRelations = relations(
  bankTransactions,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [bankTransactions.tenantId],
      references: [tenants.id],
    }),
    matches: many(matches),
  }),
);

export const matchesRelations = relations(matches, ({ one }) => ({
  tenant: one(tenants, {
    fields: [matches.tenantId],
    references: [tenants.id],
  }),
  bankTransaction: one(bankTransactions, {
    fields: [matches.bankTransactionId],
    references: [bankTransactions.id],
  }),
  invoice: one(invoices, {
    fields: [matches.invoiceId],
    references: [invoices.id],
  }),
}));
