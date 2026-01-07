import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return access token with default expires_in when JWT_EXPIRES_IN is not set', async () => {
      const loginDto: LoginDto = {
        userId: 'user123',
        email: 'user@example.com',
        roles: ['admin'],
        orgId: 'org1',
        orgRoles: ['member'],
        isSuperAdmin: false,
      };

      mockConfigService.get.mockReturnValue(undefined);
      mockJwtService.sign.mockReturnValue('mock-token');

      const result = await service.login(loginDto);

      expect(result).toEqual({
        access_token: 'mock-token',
        expires_in: '1d',
        token_type: 'Bearer',
      });

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user123',
        email: 'user@example.com',
        roles: ['admin'],
        orgId: 'org1',
        orgRoles: ['member'],
        isSuperAdmin: false,
      });
    });

    it('should return access token with custom expires_in from config', async () => {
      const loginDto: LoginDto = {
        userId: 'user123',
        email: 'user@example.com',
      };

      mockConfigService.get.mockReturnValue('2h');
      mockJwtService.sign.mockReturnValue('mock-token-2h');

      const result = await service.login(loginDto);

      expect(result).toEqual({
        access_token: 'mock-token-2h',
        expires_in: '2h',
        token_type: 'Bearer',
      });

      expect(configService.get).toHaveBeenCalledWith('JWT_EXPIRES_IN');
    });

    it('should handle optional fields with defaults', async () => {
      const loginDto: LoginDto = {
        userId: 'user123',
      };

      mockConfigService.get.mockReturnValue('1d');
      mockJwtService.sign.mockReturnValue('token');

      const result = await service.login(loginDto);

      expect(result.access_token).toBe('token');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user123',
        email: undefined,
        roles: [],
        orgId: undefined,
        orgRoles: [],
        isSuperAdmin: false,
      });
    });

    it('should handle isSuperAdmin flag', async () => {
      const loginDto: LoginDto = {
        userId: 'admin123',
        isSuperAdmin: true,
      };

      mockConfigService.get.mockReturnValue('1d');
      mockJwtService.sign.mockReturnValue('admin-token');

      const result = await service.login(loginDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'admin123',
          isSuperAdmin: true,
        }),
      );
    });
  });

  describe('generateToken', () => {
    it('should generate a token from payload', async () => {
      const payload: JwtPayload = {
        sub: 'user123',
        email: 'test@example.com',
        roles: ['user'],
        orgId: 'org1',
        orgRoles: ['member'],
        isSuperAdmin: false,
      };

      mockJwtService.sign.mockReturnValue('generated-token');

      const result = await service.generateToken(payload);

      expect(result).toBe('generated-token');
      expect(mockJwtService.sign).toHaveBeenCalledWith(payload);
    });

    it('should generate token with minimal payload', async () => {
      const payload: JwtPayload = {
        sub: 'user123',
      };

      mockJwtService.sign.mockReturnValue('minimal-token');

      const result = await service.generateToken(payload);

      expect(result).toBe('minimal-token');
      expect(mockJwtService.sign).toHaveBeenCalledWith(payload);
    });
  });
});

