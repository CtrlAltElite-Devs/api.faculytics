import { Injectable, Logger } from '@nestjs/common';
import { MoodleService } from '../moodle.service';
import { UserRepository } from '../../../repositories/user.repository';
import { MoodleSiteInfoResponse } from '../lib/moodle.types';

@Injectable()
export class MoodleSyncService {
  private readonly logger = new Logger(MoodleSyncService.name);

  constructor(
    private readonly moodleService: MoodleService,
    private readonly userRepository: UserRepository,
  ) {}

  async SyncUserContext(token: string) {
    this.logger.log('Starting user context synchronization from Moodle...');

    let siteInfoResponse: MoodleSiteInfoResponse;
    try {
      siteInfoResponse = await this.moodleService.GetSiteInfo({
        token,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to fetch site info from Moodle: ${message}`,
        stack,
      );
      throw error;
    }

    const user = await this.userRepository.UpsertFromMoodle(siteInfoResponse);

    this.logger.log(
      `Successfully synced user context for Moodle user ${siteInfoResponse.userid}`,
    );

    return user;
  }
}
