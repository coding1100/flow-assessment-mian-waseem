import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchesService, Candidate } from './matches.service';
import { AiExplanationService } from '../common/services/ai-explanation.service';
import { db } from '../db';
import {
  tenants,
  invoices,
  bankTransactions,
  vendors,
  matches,
} from '../schema';
import { eq, and } from 'drizzle-orm';

// Mock global fetch
global.fetch = jest.fn();

jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('MatchesService', () => {
  let service: MatchesService;
  let configService: ConfigService;
  let aiExplanationService: AiExplanationService;
  let mockSelect: jest.Mock;
  let mockInsert: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockDelete: jest.Mock;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('http://localhost:8000'),
  };

  const mockAiExplanationService = {
    generateExplanation: jest.fn(),
  };

  beforeEach(async () => {
    mockSelect = jest.fn();
    mockInsert = jest.fn();
    mockUpdate = jest.fn();
    mockDelete = jest.fn();

    (db.select as jest.Mock) = mockSelect;
    (db.insert as jest.Mock) = mockInsert;
    (db.update as jest.Mock) = mockUpdate;
    (db.delete as jest.Mock) = mockDelete;

    (global.fetch as jest.Mock).mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AiExplanationService,
          useValue: mockAiExplanationService,
        },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
    configService = module.get<ConfigService>(ConfigService);
    aiExplanationService = module.get<AiExplanationService>(
      AiExplanationService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('reconcile', () => {
    const tenantId = 1;
    const topN = 10;

    it('should reconcile successfully with invoices and transactions', async () => {
      // Mock tenant exists
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      // Mock invoices
      const mockInvoices = [
        {
          id: 1,
          vendor_id: 1,
          invoice_number: 'INV-1',
          invoice_datetime: new Date(),
          amount: 100.0,
          currency: 'USD',
          description: 'Invoice 1',
          vendor_name: 'Vendor 1',
        },
      ];
      const mockInvoiceWhere = jest.fn().mockResolvedValue(mockInvoices);
      const mockInvoiceInnerJoin = jest.fn().mockReturnValue({
        where: mockInvoiceWhere,
      });
      const mockInvoiceFrom = jest.fn().mockReturnValue({
        innerJoin: mockInvoiceInnerJoin,
      });
      const mockInvoiceSelect = {
        from: mockInvoiceFrom,
      };

      // Mock transactions
      const mockTransactions = [
        {
          id: 1,
          tenantId,
          externalId: 'ext-1',
          postedAt: new Date(),
          amount: 100.0,
          currency: 'USD',
        },
      ];
      const mockTransactionWhere = jest.fn().mockResolvedValue(mockTransactions);
      const mockTransactionFrom = jest.fn().mockReturnValue({
        where: mockTransactionWhere,
      });

      // Mock delete existing matches
      const mockDeleteReturning = jest.fn().mockResolvedValue([]);
      const mockDeleteWhere = jest.fn().mockReturnValue({
        returning: mockDeleteReturning,
      });
      mockDelete.mockReturnValue({ where: mockDeleteWhere });

      // Mock fetch Python GraphQL
      const mockCandidates: Candidate[] = [
        {
          invoice_id: 1,
          transaction_id: 1,
          score: 0.9,
          explanations: ['Amount matches'],
        },
      ];
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            scoreCandidates: [
              {
                invoiceId: 1,
                transactionId: 1,
                score: 0.9,
                explanations: ['Amount matches'],
              },
            ],
          },
        }),
      });

      // Mock insert matches
      const mockMatch = {
        id: 1,
        tenantId,
        invoiceId: 1,
        bankTransactionId: 1,
        score: 0.9,
        status: 'PROPOSED',
      };

      // Mock check existing match
      const mockMatchLimit = jest.fn().mockResolvedValue([]);
      const mockMatchWhere = jest.fn().mockReturnValue({
        limit: mockMatchLimit,
      });
      const mockMatchFrom = jest.fn().mockReturnValue({
        where: mockMatchWhere,
      });

      // Mock insert new match
      const mockInsertReturning = jest.fn().mockResolvedValue([mockMatch]);
      const mockInsertValues = jest.fn().mockReturnValue({
        returning: mockInsertReturning,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce(mockInvoiceSelect)
        .mockReturnValueOnce({ from: mockTransactionFrom })
        .mockReturnValueOnce({ from: mockMatchFrom });

      mockInsert.mockReturnValue({ values: mockInsertValues });

      const result = await service.reconcile(tenantId, topN);

      expect(result.candidates).toBeDefined();
      expect(result.byInvoice).toBeDefined();
      expect(result.byTransaction).toBeDefined();
    });

    it('should return message when no invoices found', async () => {
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockInvoiceWhere = jest.fn().mockResolvedValue([]);
      const mockInvoiceInnerJoin = jest.fn().mockReturnValue({
        where: mockInvoiceWhere,
      });
      const mockInvoiceFrom = jest.fn().mockReturnValue({
        innerJoin: mockInvoiceInnerJoin,
      });
      const mockInvoiceSelect = {
        from: mockInvoiceFrom,
      };

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce(mockInvoiceSelect)
        .mockReturnValueOnce({ from: mockTenantFrom }); // Extra call for transaction fetch

      const result = await service.reconcile(tenantId, topN);

      expect(result.message).toBe('No invoices found for this tenant');
      expect(result.candidates).toEqual([]);
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      await expect(service.reconcile(tenantId, topN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle Python engine errors', async () => {
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockInvoices = [
        {
          id: 1,
          vendor_id: 1,
          invoice_number: 'INV-1',
          invoice_datetime: new Date(),
          amount: 100.0,
          currency: 'USD',
          description: 'Invoice 1',
          vendor_name: 'Vendor 1',
        },
      ];
      const mockInvoiceWhere = jest.fn().mockResolvedValue(mockInvoices);
      const mockInvoiceInnerJoin = jest.fn().mockReturnValue({
        where: mockInvoiceWhere,
      });
      const mockInvoiceFrom = jest.fn().mockReturnValue({
        innerJoin: mockInvoiceInnerJoin,
      });
      const mockInvoiceSelect = {
        from: mockInvoiceFrom,
      };

      const mockTransactions = [
        {
          id: 1,
          tenantId,
          externalId: 'ext-1',
          postedAt: new Date(),
          amount: 100.0,
          currency: 'USD',
        },
      ];
      const mockTransactionWhere = jest.fn().mockResolvedValue(mockTransactions);
      const mockTransactionFrom = jest.fn().mockReturnValue({
        where: mockTransactionWhere,
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce(mockInvoiceSelect)
        .mockReturnValueOnce({ from: mockTransactionFrom })
        .mockReturnValueOnce({ from: mockTenantFrom }); // Extra call for match operations

      await expect(service.reconcile(tenantId, topN)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('confirm', () => {
    const tenantId = 1;
    const matchId = 1;

    it('should confirm a proposed match', async () => {
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockMatch = {
        id: matchId,
        tenantId,
        status: 'PROPOSED',
      };

      const mockMatchLimit = jest.fn().mockResolvedValue([mockMatch]);
      const mockMatchWhere = jest.fn().mockReturnValue({
        limit: mockMatchLimit,
      });
      const mockMatchFrom = jest.fn().mockReturnValue({
        where: mockMatchWhere,
      });

      const mockUpdatedMatch = {
        ...mockMatch,
        status: 'CONFIRMED',
      };

      const mockUpdateReturning = jest.fn().mockResolvedValue([mockUpdatedMatch]);
      const mockUpdateWhere = jest.fn().mockReturnValue({
        returning: mockUpdateReturning,
      });
      const mockUpdateSet = jest.fn().mockReturnValue({
        where: mockUpdateWhere,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce({ from: mockMatchFrom });

      mockUpdate.mockReturnValue({ set: mockUpdateSet });

      const result = await service.confirm(tenantId, matchId);

      expect(result.status).toBe('CONFIRMED');
    });

    it('should throw NotFoundException if match not found', async () => {
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockMatchLimit = jest.fn().mockResolvedValue([]);
      const mockMatchWhere = jest.fn().mockReturnValue({
        limit: mockMatchLimit,
      });
      const mockMatchFrom = jest.fn().mockReturnValue({
        where: mockMatchWhere,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce({ from: mockMatchFrom });

      await expect(service.confirm(tenantId, matchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if match is not PROPOSED', async () => {
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockMatch = {
        id: matchId,
        tenantId,
        status: 'CONFIRMED',
      };

      const mockMatchLimit = jest.fn().mockResolvedValue([mockMatch]);
      const mockMatchWhere = jest.fn().mockReturnValue({
        limit: mockMatchLimit,
      });
      const mockMatchFrom = jest.fn().mockReturnValue({
        where: mockMatchWhere,
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce({ from: mockMatchFrom });

      await expect(service.confirm(tenantId, matchId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('explainReconciliation', () => {
    const tenantId = 1;
    const invoiceId = 1;
    const transactionId = 1;

    it('should explain reconciliation successfully', async () => {
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockInvoice = {
        id: invoiceId,
        vendor_id: 1,
        invoice_number: 'INV-1',
        invoice_datetime: new Date(),
        amount: 100.0,
        currency: 'USD',
        description: 'Invoice',
        vendor_name: 'Vendor',
      };

      const mockInvoiceLimit = jest.fn().mockResolvedValue([mockInvoice]);
      const mockInvoiceWhere = jest.fn().mockReturnValue({
        limit: mockInvoiceLimit,
      });
      const mockInvoiceInnerJoin = jest.fn().mockReturnValue({
        where: mockInvoiceWhere,
      });
      const mockInvoiceFrom = jest.fn().mockReturnValue({
        innerJoin: mockInvoiceInnerJoin,
      });
      const mockInvoiceSelect = {
        from: mockInvoiceFrom,
      };

      const mockTransaction = {
        id: transactionId,
        tenantId,
        externalId: 'ext-1',
        postedAt: new Date(),
        amount: 100.0,
        currency: 'USD',
      };

      const mockTransactionLimit = jest.fn().mockResolvedValue([mockTransaction]);
      const mockTransactionWhere = jest.fn().mockReturnValue({
        limit: mockTransactionLimit,
      });
      const mockTransactionFrom = jest.fn().mockReturnValue({
        where: mockTransactionWhere,
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            scoreCandidates: [
              {
                invoiceId,
                transactionId,
                score: 0.9,
                explanations: ['Amount matches'],
              },
            ],
          },
        }),
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce(mockInvoiceSelect)
        .mockReturnValueOnce({ from: mockTransactionFrom });

      const result = await service.explainReconciliation(
        tenantId,
        invoiceId,
        transactionId,
      );

      expect(result.score).toBe(0.9);
      expect(result.explanations).toEqual(['Amount matches']);
    });

    it('should return zero score when no candidates found', async () => {
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockInvoice = {
        id: invoiceId,
        vendor_id: 1,
        invoice_number: 'INV-1',
        invoice_datetime: new Date(),
        amount: 100.0,
        currency: 'USD',
        description: 'Invoice',
        vendor_name: 'Vendor',
      };

      const mockInvoiceLimit = jest.fn().mockResolvedValue([mockInvoice]);
      const mockInvoiceWhere = jest.fn().mockReturnValue({
        limit: mockInvoiceLimit,
      });
      const mockInvoiceInnerJoin = jest.fn().mockReturnValue({
        where: mockInvoiceWhere,
      });
      const mockInvoiceFrom = jest.fn().mockReturnValue({
        innerJoin: mockInvoiceInnerJoin,
      });
      const mockInvoiceSelect = {
        from: mockInvoiceFrom,
      };

      const mockTransaction = {
        id: transactionId,
        tenantId,
        externalId: 'ext-1',
        postedAt: new Date(),
        amount: 100.0,
        currency: 'USD',
      };

      const mockTransactionLimit = jest.fn().mockResolvedValue([mockTransaction]);
      const mockTransactionWhere = jest.fn().mockReturnValue({
        limit: mockTransactionLimit,
      });
      const mockTransactionFrom = jest.fn().mockReturnValue({
        where: mockTransactionWhere,
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { scoreCandidates: [] },
        }),
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce(mockInvoiceSelect)
        .mockReturnValueOnce({ from: mockTransactionFrom });

      const result = await service.explainReconciliation(
        tenantId,
        invoiceId,
        transactionId,
      );

      expect(result.score).toBe(0);
      expect(result.explanations).toContain('No match found between this invoice and transaction');
    });
  });

  describe('explainMatch', () => {
    const tenantId = 1;
    const invoiceId = 1;
    const transactionId = 1;

    it('should explain match with AI explanation', async () => {
      const mockTenantLimit = jest.fn().mockResolvedValue([{ id: tenantId }]);
      const mockTenantWhere = jest.fn().mockReturnValue({
        limit: mockTenantLimit,
      });
      const mockTenantFrom = jest.fn().mockReturnValue({
        where: mockTenantWhere,
      });

      const mockInvoice = {
        id: invoiceId,
        vendor_id: 1,
        invoice_number: 'INV-1',
        invoice_datetime: new Date(),
        amount: 100.0,
        currency: 'USD',
        description: 'Invoice',
        vendor_name: 'Vendor',
      };

      const mockInvoiceLimit = jest.fn().mockResolvedValue([mockInvoice]);
      const mockInvoiceWhere = jest.fn().mockReturnValue({
        limit: mockInvoiceLimit,
      });
      const mockInvoiceInnerJoin = jest.fn().mockReturnValue({
        where: mockInvoiceWhere,
      });
      const mockInvoiceFrom = jest.fn().mockReturnValue({
        innerJoin: mockInvoiceInnerJoin,
      });
      const mockInvoiceSelect = {
        from: mockInvoiceFrom,
      };

      const mockTransaction = {
        id: transactionId,
        tenantId,
        externalId: 'ext-1',
        postedAt: new Date(),
        amount: 100.0,
        currency: 'USD',
      };

      const mockTransactionLimit = jest.fn().mockResolvedValue([mockTransaction]);
      const mockTransactionWhere = jest.fn().mockReturnValue({
        limit: mockTransactionLimit,
      });
      const mockTransactionFrom = jest.fn().mockReturnValue({
        where: mockTransactionWhere,
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            scoreCandidates: [
              {
                invoiceId,
                transactionId,
                score: 0.9,
                explanations: ['Amount matches'],
              },
            ],
          },
        }),
      });

      mockAiExplanationService.generateExplanation.mockResolvedValue({
        explanation: 'AI explanation',
        confidence: 'high',
        source: 'ai',
      });

      mockSelect
        .mockReturnValueOnce({ from: mockTenantFrom })
        .mockReturnValueOnce(mockInvoiceSelect)
        .mockReturnValueOnce({ from: mockTransactionFrom });

      const result = await service.explainMatch(
        tenantId,
        invoiceId,
        transactionId,
      );

      expect(result.explanation).toBe('AI explanation');
      expect(result.confidence).toBe('high');
      expect(mockAiExplanationService.generateExplanation).toHaveBeenCalled();
    });
  });
});

