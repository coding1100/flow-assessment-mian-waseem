import { Test, TestingModule } from '@nestjs/testing';
import { GraphQLResolver } from './graphql.resolver';
import { TenantsService } from '../tenants/tenants.service';
import { VendorsService } from '../vendors/vendors.service';
import { InvoicesService } from '../invoices/invoices.service';
import { BankTransactionsService } from '../bank-transactions/bank-transactions.service';
import { MatchesService } from '../matches/matches.service';
import { CreateTenantInput } from './inputs/create-tenant.input';
import { CreateVendorInput } from './inputs/create-vendor.input';
import { CreateInvoiceInput } from './inputs/create-invoice.input';
import { ImportBankTransactionsInput } from './inputs/import-bank-transactions.input';

describe('GraphQLResolver', () => {
  let resolver: GraphQLResolver;
  let tenantsService: TenantsService;
  let vendorsService: VendorsService;
  let invoicesService: InvoicesService;
  let bankTransactionsService: BankTransactionsService;
  let matchesService: MatchesService;

  const mockTenantsService = {
    findAll: jest.fn(),
    create: jest.fn(),
  };

  const mockVendorsService = {
    findAll: jest.fn(),
    create: jest.fn(),
  };

  const mockInvoicesService = {
    findAll: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
  };

  const mockBankTransactionsService = {
    findAll: jest.fn(),
    import: jest.fn(),
  };

  const mockMatchesService = {
    reconcile: jest.fn(),
    confirm: jest.fn(),
    explainReconciliation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphQLResolver,
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
        {
          provide: VendorsService,
          useValue: mockVendorsService,
        },
        {
          provide: InvoicesService,
          useValue: mockInvoicesService,
        },
        {
          provide: BankTransactionsService,
          useValue: mockBankTransactionsService,
        },
        {
          provide: MatchesService,
          useValue: mockMatchesService,
        },
      ],
    }).compile();

    resolver = module.get<GraphQLResolver>(GraphQLResolver);
    tenantsService = module.get<TenantsService>(TenantsService);
    vendorsService = module.get<VendorsService>(VendorsService);
    invoicesService = module.get<InvoicesService>(InvoicesService);
    bankTransactionsService = module.get<BankTransactionsService>(
      BankTransactionsService,
    );
    matchesService = module.get<MatchesService>(MatchesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTenants', () => {
    it('should return all tenants', async () => {
      const mockTenants = [
        { id: 1, name: 'Tenant 1', createdAt: new Date() },
        { id: 2, name: 'Tenant 2', createdAt: new Date() },
      ];

      mockTenantsService.findAll.mockResolvedValue(mockTenants);

      const result = await resolver.getTenants();

      expect(result).toEqual(mockTenants);
      expect(mockTenantsService.findAll).toHaveBeenCalled();
    });
  });

  describe('getVendors', () => {
    it('should return vendors for a tenant', async () => {
      const tenantId = 1;
      const mockVendors = [
        { id: 1, tenantId: 1, name: 'Vendor 1', createdAt: new Date() },
      ];

      mockVendorsService.findAll.mockResolvedValue(mockVendors);

      const result = await resolver.getVendors(tenantId);

      expect(result).toEqual(mockVendors);
      expect(mockVendorsService.findAll).toHaveBeenCalledWith(tenantId);
    });
  });

  describe('getInvoices', () => {
    it('should return invoices with pagination', async () => {
      const tenantId = 1;
      const mockInvoices = [
        {
          id: 1,
          tenantId: 1,
          vendorId: 1,
          invoiceNumber: 'INV-1',
          amount: 100.0,
        },
        {
          id: 2,
          tenantId: 1,
          vendorId: 1,
          invoiceNumber: 'INV-2',
          amount: 200.0,
        },
      ];

      mockInvoicesService.findAll.mockResolvedValue(mockInvoices);

      const result = await resolver.getInvoices(tenantId, undefined, {
        page: 1,
        limit: 10,
      });

      expect(result.edges).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.hasPreviousPage).toBe(false);
    });

    it('should apply filters when provided', async () => {
      const tenantId = 1;
      const filters = {
        status: 'OPEN',
        vendorId: 1,
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
        minAmount: 10,
        maxAmount: 100,
      };

      mockInvoicesService.findAll.mockResolvedValue([]);

      await resolver.getInvoices(tenantId, filters, undefined);

      expect(mockInvoicesService.findAll).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          status: filters.status,
          vendorId: filters.vendorId,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          minAmount: filters.minAmount,
          maxAmount: filters.maxAmount,
        }),
      );
    });
  });

  describe('getBankTransactions', () => {
    it('should return bank transactions with pagination', async () => {
      const tenantId = 1;
      const mockTransactions = [
        {
          id: 1,
          tenantId: 1,
          externalId: 'ext-1',
          amount: 100.0,
        },
      ];

      mockBankTransactionsService.findAll.mockResolvedValue(mockTransactions);

      const result = await resolver.getBankTransactions(tenantId, undefined, {
        page: 1,
        limit: 10,
      });

      expect(result.edges).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });
  });

  describe('getMatchCandidates', () => {
    it('should return match candidates', async () => {
      const tenantId = 1;
      const mockReconcileResult = {
        candidates: [
          {
            id: 1,
            invoiceId: 1,
            bankTransactionId: 1,
            score: 0.9,
            status: 'PROPOSED',
          },
        ],
        byInvoice: {},
        byTransaction: {},
      };

      mockMatchesService.reconcile.mockResolvedValue(mockReconcileResult);

      const result = await resolver.getMatchCandidates(tenantId, undefined);

      expect(result).toHaveLength(1);
      expect(result[0].invoiceId).toBe(1);
      expect(result[0].transactionId).toBe(1);
    });
  });

  describe('createTenant', () => {
    it('should create a tenant', async () => {
      const input: CreateTenantInput = { name: 'New Tenant' };
      const mockTenant = {
        id: 1,
        name: 'New Tenant',
        createdAt: new Date(),
      };

      mockTenantsService.create.mockResolvedValue(mockTenant);

      const result = await resolver.createTenant(input);

      expect(result).toEqual(mockTenant);
      expect(mockTenantsService.create).toHaveBeenCalledWith(input);
    });
  });

  describe('createVendor', () => {
    it('should create a vendor', async () => {
      const tenantId = 1;
      const input: CreateVendorInput = { name: 'New Vendor' };
      const mockVendor = {
        id: 1,
        tenantId: 1,
        name: 'New Vendor',
        createdAt: new Date(),
      };

      mockVendorsService.create.mockResolvedValue(mockVendor);

      const result = await resolver.createVendor(tenantId, input);

      expect(result).toEqual(mockVendor);
      expect(mockVendorsService.create).toHaveBeenCalledWith(tenantId, input);
    });
  });

  describe('createInvoice', () => {
    it('should create an invoice', async () => {
      const tenantId = 1;
      const input: CreateInvoiceInput = {
        vendorId: 1,
        invoiceDatetime: '2024-01-01T00:00:00Z',
        amount: 100.0,
      };
      const mockInvoice = {
        id: 1,
        tenantId: 1,
        vendorId: 1,
        invoiceNumber: 'INV-1',
        amount: 100.0,
      };

      mockInvoicesService.create.mockResolvedValue(mockInvoice);

      const result = await resolver.createInvoice(tenantId, input);

      expect(result).toEqual(mockInvoice);
      expect(mockInvoicesService.create).toHaveBeenCalledWith(tenantId, input);
    });
  });

  describe('deleteInvoice', () => {
    it('should delete an invoice', async () => {
      const tenantId = 1;
      const invoiceId = 1;

      mockInvoicesService.remove.mockResolvedValue({ deleted: true });

      const result = await resolver.deleteInvoice(tenantId, invoiceId);

      expect(result).toBe(true);
      expect(mockInvoicesService.remove).toHaveBeenCalledWith(
        tenantId,
        invoiceId,
      );
    });
  });

  describe('importBankTransactions', () => {
    it('should import bank transactions', async () => {
      const tenantId = 1;
      const input: ImportBankTransactionsInput = {
        transactions: [
          {
            externalId: 'ext-1',
            postedAt: '2024-01-01T00:00:00Z',
            amount: 100.0,
          },
        ],
      };
      const mockResponse = {
        imported: 1,
        transactions: [
          {
            id: 1,
            tenantId: 1,
            externalId: 'ext-1',
            amount: 100.0,
          },
        ],
      };

      mockBankTransactionsService.import.mockResolvedValue(mockResponse);

      const result = await resolver.importBankTransactions(
        tenantId,
        input,
        undefined,
      );

      expect(result.imported).toBe(1);
      expect(result.transactions).toHaveLength(1);
    });
  });

  describe('reconcile', () => {
    it('should reconcile invoices and transactions', async () => {
      const tenantId = 1;
      const input = { topN: 10 };
      const mockResult = {
        candidates: [],
        byInvoice: {},
        byTransaction: {},
      };

      mockMatchesService.reconcile.mockResolvedValue(mockResult);

      const result = await resolver.reconcile(tenantId, input);

      expect(result.candidates).toEqual([]);
      expect(mockMatchesService.reconcile).toHaveBeenCalledWith(tenantId, 10);
    });

    it('should use default topN if not provided', async () => {
      const tenantId = 1;
      const mockResult = {
        candidates: [],
        byInvoice: {},
        byTransaction: {},
      };

      mockMatchesService.reconcile.mockResolvedValue(mockResult);

      await resolver.reconcile(tenantId, undefined);

      expect(mockMatchesService.reconcile).toHaveBeenCalledWith(tenantId, 10);
    });
  });

  describe('confirmMatch', () => {
    it('should confirm a match', async () => {
      const tenantId = 1;
      const matchId = 1;
      const mockMatch = {
        id: matchId,
        tenantId: 1,
        invoiceId: 1,
        bankTransactionId: 1,
        status: 'CONFIRMED',
      };

      mockMatchesService.confirm.mockResolvedValue(mockMatch);

      const result = await resolver.confirmMatch(tenantId, matchId);

      expect(result).toEqual(mockMatch);
      expect(mockMatchesService.confirm).toHaveBeenCalledWith(
        tenantId,
        matchId,
      );
    });
  });

  describe('explainReconciliation', () => {
    it('should explain reconciliation', async () => {
      const tenantId = 1;
      const invoiceId = 1;
      const transactionId = 1;
      const mockExplanation = {
        score: 0.9,
        explanations: ['Amount matches'],
      };

      mockMatchesService.explainReconciliation.mockResolvedValue(
        mockExplanation,
      );

      const result = await resolver.explainReconciliation(
        tenantId,
        invoiceId,
        transactionId,
      );

      expect(result).toEqual(mockExplanation);
      expect(mockMatchesService.explainReconciliation).toHaveBeenCalledWith(
        tenantId,
        invoiceId,
        transactionId,
      );
    });
  });
});

