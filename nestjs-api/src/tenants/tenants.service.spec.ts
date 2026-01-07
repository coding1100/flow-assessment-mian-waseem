import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { db } from '../db';
import { tenants } from '../schema';

jest.mock('../db', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
  },
}));

describe('TenantsService', () => {
  let service: TenantsService;
  let mockInsert: jest.Mock;
  let mockSelect: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantsService],
    }).compile();

    service = module.get<TenantsService>(TenantsService);

    // Setup mocks
    mockInsert = jest.fn();
    mockSelect = jest.fn();

    (db.insert as jest.Mock) = mockInsert;
    (db.select as jest.Mock) = mockSelect;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a tenant successfully', async () => {
      const createDto: CreateTenantDto = { name: 'Test Tenant' };
      const mockTenant = {
        id: 1,
        name: 'Test Tenant',
        createdAt: new Date(),
      };

      const mockReturning = jest.fn().mockResolvedValue([mockTenant]);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      const result = await service.create(createDto);

      expect(result).toEqual(mockTenant);
      expect(mockInsert).toHaveBeenCalledWith(tenants);
      expect(mockValues).toHaveBeenCalledWith({ name: 'Test Tenant' });
    });

    it('should throw BadRequestException on unique constraint violation', async () => {
      const createDto: CreateTenantDto = { name: 'Existing Tenant' };
      const error = new Error('Duplicate key');
      (error as any).code = '23505';

      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'Tenant name already exists',
      );
    });

    it('should throw BadRequestException on not null violation', async () => {
      const createDto: CreateTenantDto = { name: 'Test' };
      const error = new Error('Null violation');
      (error as any).code = '23502';

      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'Required field is missing',
      );
    });

    it('should re-throw other errors', async () => {
      const createDto: CreateTenantDto = { name: 'Test' };
      const error = new Error('Database connection error');
      (error as any).code = '08000';

      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      await expect(service.create(createDto)).rejects.toThrow(
        'Database connection error',
      );
    });
  });

  describe('findAll', () => {
    it('should return all tenants ordered by id', async () => {
      const mockTenants = [
        { id: 1, name: 'Tenant 1', createdAt: new Date() },
        { id: 2, name: 'Tenant 2', createdAt: new Date() },
      ];

      const mockOrderBy = jest.fn().mockResolvedValue(mockTenants);
      const mockFrom = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      mockSelect.mockReturnValue({ from: mockFrom });

      const result = await service.findAll();

      expect(result).toEqual(mockTenants);
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(tenants);
      expect(mockOrderBy).toHaveBeenCalledWith(tenants.id);
    });

    it('should throw error on database failure', async () => {
      const error = new Error('Database error');
      const mockOrderBy = jest.fn().mockRejectedValue(error);
      const mockFrom = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      mockSelect.mockReturnValue({ from: mockFrom });

      await expect(service.findAll()).rejects.toThrow('Database error');
    });
  });

  describe('findOne', () => {
    it('should return a tenant by id', async () => {
      const mockTenant = {
        id: 1,
        name: 'Test Tenant',
        createdAt: new Date(),
      };

      const mockWhere = jest.fn().mockResolvedValue([mockTenant]);
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      const result = await service.findOne(1);

      expect(result).toEqual(mockTenant);
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should return null when tenant not found', async () => {
      const mockWhere = jest.fn().mockResolvedValue([]);
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      const result = await service.findOne(999);

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const error = new Error('Database error');
      const mockWhere = jest.fn().mockRejectedValue(error);
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      await expect(service.findOne(1)).rejects.toThrow('Database error');
    });
  });
});

