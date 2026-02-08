import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { env } from 'src/configurations/env';
import { RefreshJwtPayload } from 'src/modules/common/custom-jwt-service/refresh-jwt-payload.dto';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: env.REFRESH_SECRET,
      ignoreExpiration: false,
    });
  }

  validate(payload: RefreshJwtPayload) {
    return {
      userId: payload.sub,
      refreshTokenId: payload.jti,
    };
  }
}
