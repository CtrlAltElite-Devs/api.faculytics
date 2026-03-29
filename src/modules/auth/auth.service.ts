import {
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginRequest } from './dto/requests/login.request.dto';
import UnitOfWork from '../common/unit-of-work';
import { JwtPayload } from '../common/custom-jwt-service/jwt-payload.dto';
import { CustomJwtService } from '../common/custom-jwt-service';
import { LoginResponse } from './dto/responses/login.response.dto';
import { User } from 'src/entities/user.entity';
import { MeResponse } from './dto/responses/me.response.dto';
import { RefreshJwtPayload } from '../common/custom-jwt-service/refresh-jwt-payload.dto';
import { v4 } from 'uuid';
import { RefreshToken } from 'src/entities/refresh-token.entity';
import * as bcrypt from 'bcrypt';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import {
  LOGIN_STRATEGIES,
  LoginStrategy,
  type LoginStrategyResult,
} from './strategies';
import { CurrentUserService } from '../common/cls/current-user.service';
import { RequestMetadataService } from '../common/cls/request-metadata.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-action.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly sortedStrategies: LoginStrategy[];

  constructor(
    @Inject(LOGIN_STRATEGIES)
    loginStrategies: LoginStrategy[],
    private readonly jwtService: CustomJwtService,
    private readonly unitOfWork: UnitOfWork,
    private readonly currentUserService: CurrentUserService,
    private readonly requestMetadataService: RequestMetadataService,
    @Optional() private readonly auditService?: AuditService,
  ) {
    this.sortedStrategies = [...loginStrategies].sort(
      (a, b) => a.priority - b.priority,
    );
  }

  async Login(body: LoginRequest) {
    const { browserName, os, ipAddress } =
      this.requestMetadataService.get() ?? {};

    let failureReason: string | undefined;

    try {
      const result = await this.unitOfWork.runInTransaction(async (em) => {
        const localUser = await em.findOne(User, { userName: body.username });

        const strategy = this.sortedStrategies.find((s) =>
          s.CanHandle(localUser, body),
        );

        if (!strategy) {
          this.logger.warn(
            'Login attempt failed: no matching authentication strategy',
          );
          failureReason = 'no_matching_strategy';
          throw new UnauthorizedException('Invalid credentials');
        }

        let strategyResult: LoginStrategyResult;
        try {
          strategyResult = await strategy.Execute(em, localUser, body);
        } catch (error) {
          failureReason = 'strategy_execution_failed';
          throw error;
        }

        const jwtPayload = JwtPayload.Create(
          strategyResult.user.id,
          strategyResult.user.moodleUserId,
        );
        const refreshTokenPayload = RefreshJwtPayload.Create(
          strategyResult.user.id,
          v4(),
        );
        const signedTokens = await this.jwtService.CreateSignedTokens({
          jwt: jwtPayload,
          refreshJwt: refreshTokenPayload,
          userId: strategyResult.user.id,
        });

        return {
          response: LoginResponse.Map(signedTokens),
          userId: strategyResult.user.id,
          username: strategyResult.user.userName,
          strategyName: strategy.constructor.name,
        };
      });

      void this.auditService?.Emit({
        action: AuditAction.AUTH_LOGIN_SUCCESS,
        actorId: result.userId,
        actorUsername: result.username,
        metadata: { strategyUsed: result.strategyName },
        browserName,
        os,
        ipAddress,
      });

      return result.response;
    } catch (error) {
      void this.auditService?.Emit({
        action: AuditAction.AUTH_LOGIN_FAILURE,
        metadata: {
          username: body.username,
          reason: failureReason ?? 'unknown',
        },
        browserName,
        os,
        ipAddress,
      });
      throw error;
    }
  }

  Me() {
    const user = this.currentUserService.getOrFail();
    return MeResponse.Map(user);
  }

  async RefreshToken(userId: string, refreshToken: string) {
    const { browserName, os, ipAddress } =
      this.requestMetadataService.get() ?? {};

    const result = await this.unitOfWork.runInTransaction(async (em) => {
      const refreshTokenRepository: RefreshTokenRepository =
        em.getRepository(RefreshToken);

      const storedTokens = await refreshTokenRepository.find({
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() },
      });

      const comparisons = await Promise.all(
        storedTokens.map(async (token) => ({
          token,
          isMatch: await bcrypt.compare(refreshToken, token.tokenHash),
        })),
      );
      const matchingToken = comparisons.find((c) => c.isMatch)?.token;

      if (!matchingToken) {
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
      });

      matchingToken.replacedByTokenId = refreshTokenPayload.jti;

      return {
        response: LoginResponse.Map(signedTokens),
        userId: user.id,
        username: user.userName,
      };
    });

    void this.auditService?.Emit({
      action: AuditAction.AUTH_TOKEN_REFRESH,
      actorId: result.userId,
      actorUsername: result.username,
      browserName,
      os,
      ipAddress,
    });

    return result.response;
  }

  async Logout() {
    const user = this.currentUserService.getOrFail();
    await this.unitOfWork.runInTransaction(async (em) => {
      const refreshTokenRepository: RefreshTokenRepository =
        em.getRepository(RefreshToken);
      await refreshTokenRepository.revokeAllForUser(user.id);
    });
  }
}
