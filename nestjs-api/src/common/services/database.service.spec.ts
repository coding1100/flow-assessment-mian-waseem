import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { DatabaseService } from './database.service';
import { db } from '../../db';

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
  },
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockRequest: any;

  beforeEach(async () => {
    mockRequest = {
      db: undefined,
      dbClient: undefined,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDb', () => {
    it('should return request-scoped db if available', async () => {
      const mockDb = { select: jest.fn() };
      mockRequest.db = mockDb;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          {
            provide: REQUEST,
            useValue: mockRequest,
          },
        ],
      }).compile();

      service = await module.resolve<DatabaseService>(DatabaseService);

      const result = service.getDb();

      expect(result).toBe(mockDb);
      expect(result).not.toBe(db);
    });

    it('should return global db if request-scoped db is not available', async () => {
      mockRequest.db = undefined;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DatabaseService,
          {
            provide: REQUEST,
            useValue: mockRequest,
          },
        ],
      }).compile();

      service = await module.resolve<DatabaseService>(DatabaseService);

      const result = service.getDb();

      expect(result).toBe(db);
    });

    it('should return global db if request is null', async () => {
      const moduleWithoutRequest: TestingModule =
        await Test.createTestingModule({
          providers: [
            DatabaseService,
            {
              provide: REQUEST,
              useValue: null,
            },
          ],
        }).compile();

      const serviceWithoutRequest =
        await moduleWithoutRequest.resolve<DatabaseService>(DatabaseService);

      const result = serviceWithoutRequest.getDb();

      expect(result).toBe(db);
    });
  });
});

