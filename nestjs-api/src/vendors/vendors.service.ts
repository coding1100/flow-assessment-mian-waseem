import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { db } from '../db';
import { vendors } from '../schema';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { eq } from 'drizzle-orm';

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  async create(tenantId: number, dto: CreateVendorDto) {
    try {
      const [vendor] = await db
        .insert(vendors)
        .values({
          tenantId,
          name: dto.name,
        })
        .returning();
      return vendor;
    } catch (error: any) {
      this.logger.error(
        `Failed to create vendor for tenant ${tenantId}`,
        error.stack,
      );

      // Handle foreign key violations
      if (error.code === '23503') {
        throw new BadRequestException('Invalid tenant ID');
      }

      // Handle unique constraint violations
      if (error.code === '23505') {
        throw new BadRequestException('Vendor name already exists for this tenant');
      }

      // Handle not null violations
      if (error.code === '23502') {
        throw new BadRequestException('Required field is missing');
      }

      // Handle check constraint violations
      if (error.code === '23514') {
        throw new BadRequestException('Data violates business rules');
      }

      // Re-throw for other errors (will be caught by global exception filter)
      throw error;
    }
  }

  async findAll(tenantId: number) {
    try {
      return await db
        .select()
        .from(vendors)
        .where(eq(vendors.tenantId, tenantId))
        .orderBy(vendors.id);
    } catch (error: any) {
      this.logger.error(
        `Failed to find vendors for tenant ${tenantId}`,
        error.stack,
      );
      throw error;
    }
  }
}

