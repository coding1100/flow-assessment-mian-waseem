import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OrgRolesGuard } from './guards/org-roles.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import type { JwtModuleOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('JWT_SECRET') || 'your-secret-key';
        const expiresIn = (configService.get<string>('JWT_EXPIRES_IN') || '1d') as StringValue;
        
        return {
          secret,
          signOptions: {
            expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, OrgRolesGuard, SuperAdminGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, OrgRolesGuard, SuperAdminGuard, JwtModule],
})
export class AuthModule {}

