import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { DatabaseService } from '../common/services/database.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQuery } from './dto/list-invoices.query';
import { invoices } from '../schema';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let databaseService: DatabaseService;
  let mockDb: any;

  const mockDatabaseService = {
    getDb: jest.fn(),
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      delete: jest.fn(),
    };

    mockDatabaseService.getDb.mockReturnValue(mockDb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const tenantId = 1;
    const createDto: CreateInvoiceDto = {
      vendorId: 1,
      invoiceDatetime: '2024-01-01T00:00:00Z',
      amount: 100.0,
      currency: 'USD',
      status: 'OPEN',
      description: 'Test invoice',
    };

    it('should create an invoice with generated invoice number', async () => {
      // Mock count query for invoice number generation
      const mockCountResult = [{ count: 0 }];
      const mockCountWhere = jest.fn().mockResolvedValue(mockCountResult);
      const mockCountFrom = jest.fn().mockReturnValue({
        where: mockCountWhere,
      });
      
      mockDb.select.mockReturnValueOnce({
        from: mockCountFrom,
      });

      // Mock insert
      const mockInvoice = {
        id: 1,
        tenantId,
        vendorId: 1,
        invoiceNumber: 'INV-1-20240101-0001',
        invoiceDatetime: new Date('2024-01-01T00:00:00Z'),
        amount: 100.0,
        currency: 'USD',
        status: 'OPEN',
        description: 'Test invoice',
      };

      const mockReturning = jest.fn().mockResolvedValue([mockInvoice]);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockDb.insert.mockReturnValue({ values: mockValues });

      const result = await service.create(tenantId, createDto);

      expect(result).toEqual(mockInvoice);
      expect(result.invoiceNumber).toContain('INV-1-');
      expect(mockDb.insert).toHaveBeenCalledWith(invoices);
    });

    it('should use default currency if not provided', async () => {
      const dtoWithoutCurrency: CreateInvoiceDto = {
        vendorId: 1,
        invoiceDatetime: '2024-01-01T00:00:00Z',
        amount: 100.0,
      };

      const mockCountResult = [{ count: 0 }];
      const mockCountWhere = jest.fn().mockResolvedValue(mockCountResult);
      const mockCountFrom = jest.fn().mockReturnValue({
        where: mockCountWhere,
      });
      
      mockDb.select.mockReturnValueOnce({
        from: mockCountFrom,
      });

      const mockInvoice = {
        id: 1,
        tenantId,
        vendorId: 1,
        invoiceNumber: 'INV-1-20240101-0001',
        currency: 'USD',
      };

      const mockReturning = jest.fn().mockResolvedValue([mockInvoice]);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockDb.insert.mockReturnValue({ values: mockValues });

      await service.create(tenantId, dtoWithoutCurrency);

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USD',
        }),
      );
    });

    it('should throw BadRequestException on foreign key violation', async () => {
      const mockCountResult = [{ count: 0 }];
      const mockCountWhere = jest.fn().mockResolvedValue(mockCountResult);
      const mockCountFrom = jest.fn().mockReturnValue({
        where: mockCountWhere,
      });
      
      mockDb.select.mockReturnValue({
        from: mockCountFrom,
      });

      const error = new Error('Foreign key violation');
      (error as any).code = '23503';
      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockDb.insert.mockReturnValue({ values: mockValues });

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Invalid vendor or tenant ID',
      );
    });

    it('should retry on unique constraint violation for invoice number', async () => {
      const mockCountResult = [{ count: 0 }];
      const mockCountWhere = jest.fn().mockResolvedValue(mockCountResult);
      const mockCountFrom = jest.fn().mockReturnValue({
        where: mockCountWhere,
      });
      
      mockDb.select.mockReturnValueOnce({
        from: mockCountFrom,
      });

      const error = new Error('Unique constraint violation');
      (error as any).code = '23505';
      const mockInvoice = {
        id: 1,
        tenantId,
        invoiceNumber: 'INV-1-20240101-123456',
      };

      const mockReturningFirst = jest.fn().mockRejectedValue(error);
      const mockReturningSecond = jest.fn().mockResolvedValue([mockInvoice]);
      const mockValues = jest
        .fn()
        .mockReturnValueOnce({ returning: mockReturningFirst })
        .mockReturnValueOnce({ returning: mockReturningSecond });
      mockDb.insert.mockReturnValue({ values: mockValues });

      const result = await service.create(tenantId, createDto);

      expect(result).toEqual(mockInvoice);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('findAll', () => {
    const tenantId = 1;

    it('should return all invoices for tenant', async () => {
      const mockInvoices = [
        {
          id: 1,
          tenantId,
          vendorId: 1,
          invoiceNumber: 'INV-1',
          amount: 100.0,
        },
      ];

      const mockOrderBy = jest.fn().mockResolvedValue(mockInvoices);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockDb.select.mockReturnValue({ from: mockFrom });

      const result = await service.findAll(tenantId, {});

      expect(result).toEqual(mockInvoices);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply status filter', async () => {
      const query: ListInvoicesQuery = { status: 'OPEN' };

      const mockOrderBy = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockDb.select.mockReturnValue({ from: mockFrom });

      await service.findAll(tenantId, query);

      expect(mockWhere).toHaveBeenCalled();
    });

    it('should apply date filters', async () => {
      const query: ListInvoicesQuery = {
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
      };

      const mockOrderBy = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockDb.select.mockReturnValue({ from: mockFrom });

      await service.findAll(tenantId, query);

      expect(mockWhere).toHaveBeenCalled();
    });

    it('should apply amount filters', async () => {
      const query: ListInvoicesQuery = {
        minAmount: 10,
        maxAmount: 100,
      };

      const mockOrderBy = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockDb.select.mockReturnValue({ from: mockFrom });

      await service.findAll(tenantId, query);

      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const tenantId = 1;
    const invoiceId = 1;

    it('should delete an invoice successfully', async () => {
      const mockInvoice = {
        id: invoiceId,
        tenantId,
        invoiceNumber: 'INV-1',
      };

      const mockReturning = jest.fn().mockResolvedValue([mockInvoice]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      mockDb.delete.mockReturnValue({ where: mockWhere });

      const result = await service.remove(tenantId, invoiceId);

      expect(result).toEqual({ deleted: true });
      expect(mockDb.delete).toHaveBeenCalledWith(invoices);
    });

    it('should throw NotFoundException if invoice not found', async () => {
      const mockReturning = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      mockDb.delete.mockReturnValue({ where: mockWhere });

      await expect(service.remove(tenantId, invoiceId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.remove(tenantId, invoiceId)).rejects.toThrow(
        'Invoice not found',
      );
    });

    it('should throw BadRequestException on foreign key violation', async () => {
      const error = new Error('Foreign key violation');
      (error as any).code = '23503';
      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
      mockDb.delete.mockReturnValue({ where: mockWhere });

      await expect(service.remove(tenantId, invoiceId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.remove(tenantId, invoiceId)).rejects.toThrow(
        'Cannot delete invoice: it is referenced by other records',
      );
    });
  });
});

