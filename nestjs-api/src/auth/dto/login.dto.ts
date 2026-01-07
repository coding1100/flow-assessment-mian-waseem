import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class LoginDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orgRoles?: string[];

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;
}

