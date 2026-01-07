import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { db } from '../db';
import { vendors } from '../schema';

jest.mock('../db', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
  },
}));

describe('VendorsService', () => {
  let service: VendorsService;
  let mockInsert: jest.Mock;
  let mockSelect: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VendorsService],
    }).compile();

    service = module.get<VendorsService>(VendorsService);

    mockInsert = jest.fn();
    mockSelect = jest.fn();

    (db.insert as jest.Mock) = mockInsert;
    (db.select as jest.Mock) = mockSelect;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a vendor successfully', async () => {
      const createDto: CreateVendorDto = { name: 'Test Vendor' };
      const tenantId = 1;
      const mockVendor = {
        id: 1,
        tenantId: 1,
        name: 'Test Vendor',
        createdAt: new Date(),
      };

      const mockReturning = jest.fn().mockResolvedValue([mockVendor]);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      const result = await service.create(tenantId, createDto);

      expect(result).toEqual(mockVendor);
      expect(mockInsert).toHaveBeenCalledWith(vendors);
      expect(mockValues).toHaveBeenCalledWith({
        tenantId: 1,
        name: 'Test Vendor',
      });
    });

    it('should throw BadRequestException on foreign key violation', async () => {
      const createDto: CreateVendorDto = { name: 'Test Vendor' };
      const tenantId = 999;
      const error = new Error('Foreign key violation');
      (error as any).code = '23503';

      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Invalid tenant ID',
      );
    });

    it('should throw BadRequestException on unique constraint violation', async () => {
      const createDto: CreateVendorDto = { name: 'Existing Vendor' };
      const tenantId = 1;
      const error = new Error('Duplicate key');
      (error as any).code = '23505';

      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Vendor name already exists for this tenant',
      );
    });

    it('should throw BadRequestException on not null violation', async () => {
      const createDto: CreateVendorDto = { name: 'Test' };
      const tenantId = 1;
      const error = new Error('Null violation');
      (error as any).code = '23502';

      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Required field is missing',
      );
    });

    it('should throw BadRequestException on check constraint violation', async () => {
      const createDto: CreateVendorDto = { name: 'Test' };
      const tenantId = 1;
      const error = new Error('Check constraint violation');
      (error as any).code = '23514';

      const mockReturning = jest.fn().mockRejectedValue(error);
      const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues });

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Data violates business rules',
      );
    });
  });

  describe('findAll', () => {
    it('should return all vendors for a tenant', async () => {
      const tenantId = 1;
      const mockVendors = [
        {
          id: 1,
          tenantId: 1,
          name: 'Vendor 1',
          createdAt: new Date(),
        },
        {
          id: 2,
          tenantId: 1,
          name: 'Vendor 2',
          createdAt: new Date(),
        },
      ];

      const mockOrderBy = jest.fn().mockResolvedValue(mockVendors);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      const result = await service.findAll(tenantId);

      expect(result).toEqual(mockVendors);
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(vendors);
      expect(mockOrderBy).toHaveBeenCalledWith(vendors.id);
    });

    it('should throw error on database failure', async () => {
      const tenantId = 1;
      const error = new Error('Database error');
      const mockOrderBy = jest.fn().mockRejectedValue(error);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
      mockSelect.mockReturnValue({ from: mockFrom });

      await expect(service.findAll(tenantId)).rejects.toThrow('Database error');
    });
  });
});

