import { Injectable } from '@nestjs/common';
import { MoodleService } from './moodle.service';
import { UserRepository } from '../../repositories/user.repository';

@Injectable()
export class MoodleSyncService {
  constructor(
    private readonly moodleService: MoodleService,
    private readonly userRepository: UserRepository,
  ) {}

  async SyncUserContext(token: string) {
    // query site info
    const siteInfoResponse = await this.moodleService.GetSiteInfo({
      token,
    });

    const user = await this.userRepository.UpsertFromMoodle(siteInfoResponse);

    return user;
  }
}
