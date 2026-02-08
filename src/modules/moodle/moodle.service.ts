import { Injectable } from '@nestjs/common';
import { MoodleClient } from './lib/moodle.client';
import { env } from 'src/configurations/env';
import { LoginMoodleRequest } from './dto/requests/login-moodle.request.dto';
import { GetSiteInfoRequest } from './dto/requests/get-site-info.request.dto';
import { GetEnrolledCoursesRequest } from './dto/requests/get-enrolled-courses.request.dto';

@Injectable()
export class MoodleService {
  private BuildMoodleClient() {
    return new MoodleClient(env.MOODLE_BASE_URL);
  }

  async Login(dto: LoginMoodleRequest) {
    const client = this.BuildMoodleClient();
    return await client.login(dto.username, dto.password);
  }

  async GetSiteInfo(dto: GetSiteInfoRequest) {
    const client = this.BuildMoodleClient();
    client.setToken(dto.token);
    return await client.getSiteInfo();
  }

  async GetEnrolledCourses(dto: GetEnrolledCoursesRequest) {
    const client = this.BuildMoodleClient();
    client.setToken(dto.token);
    return await client.getEnrolledCourses(dto.userId);
  }
}
