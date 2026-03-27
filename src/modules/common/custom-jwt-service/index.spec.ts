import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { env } from 'src/configurations/env';
import { RefreshToken } from 'src/entities/refresh-token.entity';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { RequestMetadataService } from '../cls/request-metadata.service';
import { CustomJwtService } from './index';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('CustomJwtService', () => {
  const mockMetadata = {
    browserName: 'Chrome',
    os: 'Linux',
    ipAddress: '127.0.0.1',
  };

  const originalRefreshTokenExpiry = env.JWT_REFRESH_TOKEN_EXPIRY;
  const originalBcryptRounds = env.JWT_BCRYPT_ROUNDS;

  let service: CustomJwtService;
  let jwtService: jest.Mocked<JwtService>;
  let refreshTokenRepository: jest.Mocked<RefreshTokenRepository>;
  let requestMetadataService: jest.Mocked<RequestMetadataService>;

  beforeEach(() => {
    env.JWT_REFRESH_TOKEN_EXPIRY = '2h';
    env.JWT_BCRYPT_ROUNDS = 12;

    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
    } as unknown as jest.Mocked<JwtService>;

    refreshTokenRepository = {
      revokeActiveForDevice: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<RefreshTokenRepository>;

    requestMetadataService = {
      getOrFail: jest.fn().mockReturnValue(mockMetadata),
    } as unknown as jest.Mocked<RequestMetadataService>;

    service = new CustomJwtService(
      jwtService,
      refreshTokenRepository,
      requestMetadataService,
    );
  });

  afterEach(() => {
    env.JWT_REFRESH_TOKEN_EXPIRY = originalRefreshTokenExpiry;
    env.JWT_BCRYPT_ROUNDS = originalBcryptRounds;
    jest.clearAllMocks();
  });

  it('uses the configured refresh-token expiry and bcrypt rounds', async () => {
    const hashMock = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;
    hashMock.mockResolvedValue('hashed-token');

    await service.CreateSignedTokens({
      jwt: { sub: 'user-id' },
      refreshJwt: { sub: 'user-id', jti: 'refresh-id' },
      userId: 'user-id',
    });

    expect(jwtService.signAsync.mock.calls[1]).toEqual([
      {
        sub: 'user-id',
        jti: 'refresh-id',
      },
      {
        secret: env.REFRESH_SECRET,
        expiresIn: '2h',
      },
    ]);
    expect(hashMock).toHaveBeenCalledWith('refresh-token', 12);
  });

  it('persists a refresh token with an expiry derived from the same duration', async () => {
    const hashMock = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;
    hashMock.mockResolvedValue('hashed-token');
    const createSpy = jest.spyOn(RefreshToken, 'Create');

    const before = Date.now();
    await service.CreateSignedTokens({
      jwt: { sub: 'user-id' },
      refreshJwt: { sub: 'user-id', jti: 'refresh-id' },
      userId: 'user-id',
    });
    const after = Date.now();

    expect(refreshTokenRepository.revokeActiveForDevice.mock.calls[0]).toEqual([
      'user-id',
      mockMetadata.browserName,
      mockMetadata.os,
      mockMetadata.ipAddress,
    ]);

    expect(createSpy).toHaveBeenCalledWith(
      'hashed-token',
      'user-id',
      mockMetadata,
      'refresh-id',
      expect.any(Date),
    );

    const expiresAt = createSpy.mock.calls[0][4];
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 2 * 60 * 60 * 1000,
    );
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 2 * 60 * 60 * 1000);
  });
});
