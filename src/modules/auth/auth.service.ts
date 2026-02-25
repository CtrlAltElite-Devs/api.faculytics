import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginRequest } from './dto/requests/login.request.dto';
import UnitOfWork from '../common/unit-of-work';
import { JwtPayload } from '../common/custom-jwt-service/jwt-payload.dto';
import { CustomJwtService } from '../common/custom-jwt-service';
import { LoginResponse } from './dto/responses/login.response.dto';
import { User } from 'src/entities/user.entity';
import { MeResponse } from './dto/responses/me.response.dto';
import { RequestMetadata } from '../common/interceptors/http/enriched-request';
import { RefreshJwtPayload } from '../common/custom-jwt-service/refresh-jwt-payload.dto';
import { v4 } from 'uuid';
import { RefreshToken } from 'src/entities/refresh-token.entity';
import * as bcrypt from 'bcrypt';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { LOGIN_STRATEGIES, LoginStrategy } from './strategies';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly sortedStrategies: LoginStrategy[];

  constructor(
    @Inject(LOGIN_STRATEGIES)
    loginStrategies: LoginStrategy[],
    private readonly jwtService: CustomJwtService,
    private readonly unitOfWork: UnitOfWork,
  ) {
    this.sortedStrategies = [...loginStrategies].sort(
      (a, b) => a.priority - b.priority,
    );
  }

  async Login(body: LoginRequest, metaData: RequestMetadata) {
    return await this.unitOfWork.runInTransaction(async (em) => {
      const localUser = await em.findOne(User, { userName: body.username });

      const strategy = this.sortedStrategies.find((s) =>
        s.CanHandle(localUser, body),
      );

      if (!strategy) {
        this.logger.warn(
          'Login attempt failed: no matching authentication strategy',
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      const result = await strategy.Execute(em, localUser, body);

      const jwtPayload = JwtPayload.Create(
        result.user.id,
        result.user.moodleUserId,
      );
      const refreshTokenPayload = RefreshJwtPayload.Create(
        result.user.id,
        v4(),
      );
      const signedTokens = await this.jwtService.CreateSignedTokens({
        jwt: jwtPayload,
        refreshJwt: refreshTokenPayload,
        userId: result.user.id,
        metaData,
      });

      return LoginResponse.Map(signedTokens);
    });
  }

  Me(user: User | null | undefined) {
    if (user === null || user === undefined)
      throw new NotFoundException('user not found');
    else return MeResponse.Map(user);
  }

  async RefreshToken(
    userId: string,
    refreshToken: string,
    metaData: RequestMetadata,
  ) {
    return await this.unitOfWork.runInTransaction(async (em) => {
      const refreshTokenRepository: RefreshTokenRepository =
        em.getRepository(RefreshToken);

      const storedTokens = await refreshTokenRepository.find({
        userId,
        isActive: true,
      });

      const matchingToken = storedTokens.find((token) =>
        bcrypt.compareSync(refreshToken, token.tokenHash),
      );

      if (!matchingToken || matchingToken.expiresAt < new Date()) {
        throw new UnauthorizedException();
      }

      // Rotation prevents replay attacks.
      matchingToken.isActive = false;
      matchingToken.revokedAt = new Date();

      const user = await em.findOneOrFail(User, userId);

      // create jwt tokens
      const jwtPayload = JwtPayload.Create(user.id, user.moodleUserId);
      const refreshTokenPayload = RefreshJwtPayload.Create(user.id, v4());
      const signedTokens = await this.jwtService.CreateSignedTokens({
        jwt: jwtPayload,
        refreshJwt: refreshTokenPayload,
        userId: user.id,
        metaData,
      });

      matchingToken.replacedByTokenId = refreshTokenPayload.jti;

      return LoginResponse.Map(signedTokens);
    });
  }

  async Logout(userId: string) {
    await this.unitOfWork.runInTransaction(async (em) => {
      const refreshTokenRepository: RefreshTokenRepository =
        em.getRepository(RefreshToken);
      await refreshTokenRepository.revokeAllForUser(userId);
    });
  }
}
