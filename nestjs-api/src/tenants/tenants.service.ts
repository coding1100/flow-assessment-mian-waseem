import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { db } from '../db';
import { tenants } from '../schema';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { eq } from 'drizzle-orm';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  async create(createTenantDto: CreateTenantDto) {
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: createTenantDto.name })
        .returning();
      return tenant;
    } catch (error: any) {
      this.logger.error('Failed to create tenant', error.stack);

      // Handle unique constraint violations
      if (error.code === '23505') {
        throw new BadRequestException('Tenant name already exists');
      }

      // Handle not null violations
      if (error.code === '23502') {
        throw new BadRequestException('Required field is missing');
      }

      throw error;
    }
  }

  async findAll() {
    try {
      return await db.select().from(tenants).orderBy(tenants.id);
    } catch (error: any) {
      this.logger.error('Failed to find all tenants', error.stack);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, id));
      return tenant ?? null;
    } catch (error: any) {
      this.logger.error(`Failed to find tenant ${id}`, error.stack);
      throw error;
    }
  }
}


