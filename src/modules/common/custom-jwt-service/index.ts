import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { JwtPayload } from './jwt-payload.dto';
import { RefreshJwtPayload } from './refresh-jwt-payload.dto';
import { env } from 'src/configurations/env';
import { parseJwtDurationToMilliseconds } from 'src/configurations/env/jwt-duration.util';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import * as bcrypt from 'bcrypt';
import { RefreshToken } from 'src/entities/refresh-token.entity';
import { RequestMetadataService } from '../cls/request-metadata.service';

export type SignedAuthenticationPayload = {
  token: string;
  refreshToken: string;
};

export type CreateTokensPayload = {
  jwt: JwtPayload;
  refreshJwt: RefreshJwtPayload;
  userId: string;
};

const asJwtExpiresIn = (value: string): StringValue => value as StringValue;

@Injectable()
export class CustomJwtService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly requestMetadataService: RequestMetadataService,
  ) {}

  async CreateSignedTokens(
    payload: CreateTokensPayload,
  ): Promise<SignedAuthenticationPayload> {
    const refreshTokenExpiryMs = parseJwtDurationToMilliseconds(
      env.JWT_REFRESH_TOKEN_EXPIRY,
    );

    if (refreshTokenExpiryMs === null) {
      throw new Error('JWT_REFRESH_TOKEN_EXPIRY must be a valid duration');
    }

    const token = await this.jwtService.signAsync(payload.jwt);
    const refreshToken = await this.jwtService.signAsync(payload.refreshJwt, {
      secret: env.REFRESH_SECRET,
      expiresIn: asJwtExpiresIn(env.JWT_REFRESH_TOKEN_EXPIRY),
    });

    await this.PersistRefreshToken(
      refreshToken,
      payload.userId,
      payload.refreshJwt.jti,
      new Date(Date.now() + refreshTokenExpiryMs),
    );

    return {
      token,
      refreshToken,
    };
  }

  private async PersistRefreshToken(
    refreshToken: string,
    userId: string,
    refreshId: string,
    expiresAt: Date,
  ) {
    const metaData = this.requestMetadataService.getOrFail();
    const hashedToken = await bcrypt.hash(refreshToken, env.JWT_BCRYPT_ROUNDS);

    // revoke refresh refresh tokens
    await this.refreshTokenRepository.revokeActiveForDevice(
      userId,
      metaData.browserName,
      metaData.os,
      metaData.ipAddress,
    );

    // persist new token
    const newRefreshToken = RefreshToken.Create(
      hashedToken,
      userId,
      metaData,
      refreshId,
      expiresAt,
    );
    this.refreshTokenRepository.create(newRefreshToken);
  }
}
