import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './jwt-payload.dto';
import { env } from 'src/configurations/env';

export type SignedAuthenticationPayload = {
  token: string;
  refreshToken: string;
};

@Injectable()
export class CustomJwtService {
  constructor(private readonly jwtService: JwtService) {}

  async CreateSignedTokens(
    payload: JwtPayload,
  ): Promise<SignedAuthenticationPayload> {
    const token = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload);

    return {
      token,
      refreshToken,
    };
  }

  async VerifyAndDecodeAccessToken(accessToken: string): Promise<JwtPayload> {
    return await this.jwtService.verifyAsync<JwtPayload>(accessToken, {
      secret: env.JWT_SECRET,
    });
  }
}
