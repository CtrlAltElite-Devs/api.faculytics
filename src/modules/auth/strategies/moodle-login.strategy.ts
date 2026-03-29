import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { LoginRequest } from '../dto/requests/login.request.dto';
import { User } from 'src/entities/user.entity';
import { MoodleToken } from 'src/entities/moodle-token.entity';
import { MoodleTokenRepository } from 'src/repositories/moodle-token.repository';
import { MoodleService } from 'src/modules/moodle/moodle.service';
import { MoodleSyncService } from 'src/modules/moodle/services/moodle-sync.service';
import { MoodleUserHydrationService } from 'src/modules/moodle/services/moodle-user-hydration.service';
import { MoodleConnectivityError } from 'src/modules/moodle/lib/moodle.client';
import { LoginStrategy, LoginStrategyResult } from './login-strategy.interface';

@Injectable()
export class MoodleLoginStrategy implements LoginStrategy {
  readonly priority = 100;

  private readonly logger = new Logger(MoodleLoginStrategy.name);

  constructor(
    private readonly moodleService: MoodleService,
    private readonly moodleSyncService: MoodleSyncService,
    private readonly moodleUserHydrationService: MoodleUserHydrationService,
  ) {}

  CanHandle(localUser: User | null, _body: LoginRequest): boolean {
    return localUser === null || localUser.password === null;
  }

  async Execute(
    em: EntityManager,
    _localUser: User | null,
    body: LoginRequest,
  ): Promise<LoginStrategyResult> {
    try {
      const moodleTokenResponse = await this.moodleService.Login({
        username: body.username,
        password: body.password,
      });

      const moodleToken = moodleTokenResponse.token;

      const user = await this.moodleSyncService.SyncUserContext(moodleToken);

      const moodleTokenRepository: MoodleTokenRepository =
        em.getRepository(MoodleToken);

      await moodleTokenRepository.UpsertFromMoodle(user, moodleTokenResponse);

      if (user.moodleUserId && moodleToken) {
        await this.moodleUserHydrationService.hydrateUserCourses(
          user.moodleUserId,
          moodleToken,
        );
      }

      return { user, moodleToken };
    } catch (error) {
      if (error instanceof MoodleConnectivityError) {
        this.logger.error(
          `Moodle connectivity failure during login: ${error.message}`,
          error.cause?.stack,
        );
        throw new UnauthorizedException(
          'Moodle service is currently unreachable. Please try again later.',
        );
      }
      throw error;
    }
  }
}
