import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { BankTransactionsService } from './bank-transactions.service';
import { ImportBankTransactionsDto } from './dto/import-bank-transactions.dto';
import { db } from '../db';
import { tenants, bankTransactions, idempotencyKeys } from '../schema';
import { eq, and } from 'drizzle-orm';

jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

describe('BankTransactionsService', () => {
  let service: BankTransactionsService;
  let mockSelect: jest.Mock;
  let mockInsert: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BankTransactionsService],
    }).compile();

    service = module.get<BankTransactionsService>(BankTransactionsService);

    mockSelect = jest.fn();
    mockInsert = jest.fn();

    (db.select as jest.Mock) = mockSelect;
    (db.insert as jest.Mock) = mockInsert;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('import', () => {
    const tenantId = 1;
    const dto: ImportBankTransactionsDto = {
      transactions: [
        {
          externalId: 'ext-1',
          postedAt: '2024-01-01T00:00:00Z',
          amount: 100.0,
          currency: 'USD',
          description: 'Test transaction',
        },
      ],
    };

    it('should import transactions successfully', async () => {
      // Mock tenant exists check
      const mockLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      // Mock insert
      const mockTransactions = [
        {
          id: 1,
          tenantId,
          externalId: 'ext-1',
          postedAt: new Date('2024-01-01T00:00:00Z'),
          amount: 100.0,
          currency: 'USD',
          description: 'Test transaction',
        },
      ];
      const mockReturning = jest.fn().mockResolvedValue(mockTransactions);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      const result = await service.import(tenantId, dto);

      expect(result.imported).toBe(1);
      expect(result.transactions).toEqual(mockTransactions);
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      await expect(service.import(tenantId, dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.import(tenantId, dto)).rejects.toThrow(
        `Tenant with ID ${tenantId} not found`,
      );
    });

    it('should throw BadRequestException if transactions array is empty', async () => {
      const emptyDto: ImportBankTransactionsDto = { transactions: [] };
      const mockLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      await expect(service.import(tenantId, emptyDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.import(tenantId, emptyDto)).rejects.toThrow(
        'Transactions array cannot be empty',
      );
    });

    it('should return cached response if idempotency key exists', async () => {
      const idempotencyKey = 'test-key-123';
      const cachedResponse = { imported: 1, transactions: [] };
      
      // Calculate the actual hash that the service would use
      const createHash = require('crypto').createHash;
      const payloadHash = createHash('sha256')
        .update(JSON.stringify(dto.transactions))
        .digest('hex');

      // Mock tenant exists
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      // Mock idempotency check with matching hash
      const mockIdempotencyLimit = jest.fn().mockResolvedValue([
        {
          idempotencyKey,
          payloadHash: payloadHash,
          response: JSON.stringify(cachedResponse),
        },
      ]);
      const mockIdempotencyWhere = jest.fn().mockReturnValue({
        limit: mockIdempotencyLimit,
      });
      const mockIdempotencyFrom = jest.fn().mockReturnValue({
        where: mockIdempotencyWhere,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce({ from: mockIdempotencyFrom });

      const result = await service.import(tenantId, dto, idempotencyKey);

      expect(result).toEqual(cachedResponse);
    });

    it('should throw ConflictException if idempotency key exists with different payload', async () => {
      const idempotencyKey = 'test-key-123';

      // Mock tenant exists
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      // Mock idempotency check with different hash
      const mockIdempotencyLimit = jest.fn().mockResolvedValue([
        {
          idempotencyKey,
          payloadHash: 'different-hash',
          response: '{}',
        },
      ]);
      const mockIdempotencyWhere = jest.fn().mockReturnValue({
        limit: mockIdempotencyLimit,
      });
      const mockIdempotencyFrom = jest.fn().mockReturnValue({
        where: mockIdempotencyWhere,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce({ from: mockIdempotencyFrom });

      await expect(
        service.import(tenantId, dto, idempotencyKey),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle database errors correctly', async () => {
      const mockLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      const error = new Error('Foreign key violation');
      (error as any).code = '23503';
      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      await expect(service.import(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.import(tenantId, dto)).rejects.toThrow(
        'Invalid tenant ID',
      );
    });
  });

  describe('findAll', () => {
    const tenantId = 1;

    it('should return all transactions for tenant', async () => {
      const mockTransactions = [
        {
          id: 1,
          tenantId,
          externalId: 'ext-1',
          postedAt: new Date(),
          amount: 100.0,
        },
      ];

      // Mock tenant exists
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      // Mock transactions query
      const mockOrderBy = jest.fn().mockResolvedValue(mockTransactions);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockTransactionsFrom = jest.fn().mockReturnValue({
        where: mockWhere,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce({ from: mockTransactionsFrom });

      const result = await service.findAll(tenantId);

      expect(result).toEqual(mockTransactions);
    });

    it('should apply date filters', async () => {
      const filters = {
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
      };

      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockOrderBy = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockTransactionsFrom = jest.fn().mockReturnValue({
        where: mockWhere,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce({ from: mockTransactionsFrom });

      await service.findAll(tenantId, filters);

      expect(mockWhere).toHaveBeenCalled();
    });

    it('should apply amount filters', async () => {
      const filters = {
        minAmount: 10,
        maxAmount: 100,
      };

      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockOrderBy = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockTransactionsFrom = jest.fn().mockReturnValue({
        where: mockWhere,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce({ from: mockTransactionsFrom });

      await service.findAll(tenantId, filters);

      expect(mockWhere).toHaveBeenCalled();
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      await expect(service.findAll(tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

