import { Injectable, NotFoundException } from '@nestjs/common';
import { MoodleService } from '../moodle/moodle.service';
import { LoginRequest } from './dto/requests/login.request.dto';
import { MoodleSyncService } from '../moodle/moodle-sync.service';
import { MoodleUserHydrationService } from '../moodle/moodle-user-hydration.service';
import { MoodleTokenRepository } from '../../repositories/moodle-token.repository';
import UnitOfWork from '../common/unit-of-work';
import { JwtPayload } from '../common/custom-jwt-service/jwt-payload.dto';
import { CustomJwtService } from '../common/custom-jwt-service';
import { LoginResponse } from './dto/responses/login.response.dto';
import { User } from 'src/entities/user.entity';
import { MeResponse } from './dto/responses/me.response.dto';
import { RequestMetadata } from '../common/interceptors/http/enriched-request';
import { RefreshJwtPayload } from '../common/custom-jwt-service/refresh-jwt-payload.dto';
import { v4 } from 'uuid';
import { MoodleToken } from 'src/entities/moodle-token.entity';
import { RefreshToken } from 'src/entities/refresh-token.entity';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly moodleService: MoodleService,
    private readonly moodleSyncService: MoodleSyncService,
    private readonly moodleUserHydrationService: MoodleUserHydrationService,
    private readonly jwtService: CustomJwtService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async Login(body: LoginRequest, metaData: RequestMetadata) {
    return await this.unitOfWork.runInTransaction(async (em) => {
      let user: User | null = null;
      let moodleToken: string | undefined;

      const localUser = await em.findOne(User, { userName: body.username });

      if (localUser && localUser.password) {
        const isPasswordValid = await bcrypt.compare(
          body.password,
          localUser.password,
        );
        if (!isPasswordValid) {
          throw new UnauthorizedException('Invalid credentials');
        }
        user = localUser;
      } else {
        // login via moodle create token
        const moodleTokenResponse = await this.moodleService.Login({
          username: body.username,
          password: body.password,
        });

        moodleToken = moodleTokenResponse.token;

        // handle post login
        user = await this.moodleSyncService.SyncUserContext(
          moodleTokenResponse.token,
        );

        const moodleTokenRepository: MoodleTokenRepository =
          em.getRepository(MoodleToken);

        await moodleTokenRepository.UpsertFromMoodle(user, moodleTokenResponse);
      }

      // Hydrate user courses and enrollments immediately (Moodle users only)
      if (user.moodleUserId && moodleToken) {
        await this.moodleUserHydrationService.hydrateUserCourses(
          user.moodleUserId,
          moodleToken,
        );
      }

      // create jwt tokens
      const jwtPayload = JwtPayload.Create(user.id, user.moodleUserId);
      const refreshTokenPayload = RefreshJwtPayload.Create(user.id, v4());
      const signedTokens = await this.jwtService.CreateSignedTokens({
        jwt: jwtPayload,
        refreshJwt: refreshTokenPayload,
        userId: user.id,
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
