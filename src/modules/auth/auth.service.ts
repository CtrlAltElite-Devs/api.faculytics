import { Injectable } from '@nestjs/common';
import { MoodleService } from '../moodle/moodle.service';
import { LoginRequest } from './dto/requests/login.request.dto';
import { MoodleSyncService } from '../moodle/moodle-sync.service';
import { MoodleTokenRepository } from '../../repositories/moodle-token.repository';
import UnitOfWork from '../common/unit-of-work';

@Injectable()
export class AuthService {
  constructor(
    private readonly moodleService: MoodleService,
    private readonly moodleSyncService: MoodleSyncService,
    private readonly moodleTokenRepository: MoodleTokenRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async Login(body: LoginRequest) {
    // login via moodle create token
    const moodleTokenResponse = await this.moodleService.Login({
      username: body.username,
      password: body.password,
    });

    // handle post login
    const user = await this.moodleSyncService.SyncUserContext(
      moodleTokenResponse.token,
    );
    await this.moodleTokenRepository.UpsertFromMoodle(
      user,
      moodleTokenResponse,
    );

    await this.unitOfWork.CommitChangesAsync();
    // return jwt

    return user;
  }
}
