import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './jwt-payload.dto';
import { RefreshJwtPayload } from './refresh-jwt-payload.dto';
import { env } from 'src/configurations/env';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import * as bcrypt from 'bcrypt';
import { RequestMetadata } from '../interceptors/http/enriched-request';
import { RefreshToken } from 'src/entities/refresh-token.entity';

export type SignedAuthenticationPayload = {
  token: string;
  refreshToken: string;
};

export type CreateTokensPayload = {
  jwt: JwtPayload;
  refreshJwt: RefreshJwtPayload;
  userId: string;
  metaData: RequestMetadata;
};

@Injectable()
export class CustomJwtService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async CreateSignedTokens(
    payload: CreateTokensPayload,
  ): Promise<SignedAuthenticationPayload> {
    const token = await this.jwtService.signAsync(payload.jwt);
    const refreshToken = await this.jwtService.signAsync(payload.refreshJwt, {
      secret: env.REFRESH_SECRET,
      expiresIn: '30d',
    });

    await this.PersistRefreshToken(
      refreshToken,
      payload.metaData,
      payload.userId,
      payload.refreshJwt.jti,
    );

    return {
      token,
      refreshToken,
    };
  }

  private async PersistRefreshToken(
    refreshToken: string,
    metaData: RequestMetadata,
    userId: string,
    refreshId: string,
  ) {
    const hashedToken = await bcrypt.hash(refreshToken, 10);

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
    );
    this.refreshTokenRepository.create(newRefreshToken);
  }
}
