import { Injectable } from '@nestjs/common';
import { MoodleClient } from './lib/moodle.client';
import { env } from 'src/configurations/env';
import { LoginMoodleDto } from './dto/login-moodle.dto';

@Injectable()
export class MoodleService {
  private BuildMoodleClient() {
    return new MoodleClient(env.MOODLE_BASE_URL);
  }

  async Login(dto: LoginMoodleDto) {
    const client = this.BuildMoodleClient();
    return await client.login(dto.username, dto.password);
  }
}
