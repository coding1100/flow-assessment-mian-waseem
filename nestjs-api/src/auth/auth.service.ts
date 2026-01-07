import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: loginDto.userId,
      email: loginDto.email,
      roles: loginDto.roles || [],
      orgId: loginDto.orgId,
      orgRoles: loginDto.orgRoles || [],
      isSuperAdmin: loginDto.isSuperAdmin || false,
    };

    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '1d';

    return {
      access_token: this.jwtService.sign(payload),
      expires_in: expiresIn,
      token_type: 'Bearer',
    };
  }

  /**
   * Generate a token for testing purposes
   * In production, this should validate credentials against a database
   */
  async generateToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.sign(payload);
  }
}

