import { Injectable } from '@nestjs/common';
import { MoodleClient } from './lib/moodle.client';
import { env } from '../../configurations/env';
import { LoginMoodleRequest } from './dto/requests/login-moodle.request.dto';
import { GetSiteInfoRequest } from './dto/requests/get-site-info.request.dto';
import { GetEnrolledCoursesRequest } from './dto/requests/get-enrolled-courses.request.dto';
import { GetEnrolledUsersByCourseRequest } from './dto/requests/get-enrolled-users-by-course.request.dto';
import { GetCourseUserProfilesRequest } from './dto/requests/get-course-user-profiles.request.dto';
import { GetMoodleCoursesRequest } from './dto/requests/get-courses-request.dto';
import { GetCourseCategoriesRequest } from './dto/requests/get-course-categories.request.dto';

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

  async GetEnrolledUsersByCourse(dto: GetEnrolledUsersByCourseRequest) {
    const client = this.BuildMoodleClient();
    client.setToken(dto.token);
    return await client.getEnrolledUsersByCourse(dto.courseId);
  }

  async GetCourseUserProfiles(dto: GetCourseUserProfilesRequest) {
    const client = this.BuildMoodleClient();
    client.setToken(dto.token);
    return await client.getCourseUserProfiles([
      { userId: dto.userId, courseId: dto.courseId },
    ]);
  }

  async GetCourses(dto: GetMoodleCoursesRequest) {
    const client = this.BuildMoodleClient();
    client.setToken(dto.token);
    return await client.getCourses();
  }

  async GetCategories(dto: GetCourseCategoriesRequest) {
    const client = this.BuildMoodleClient();
    client.setToken(dto.token);
    return await client.getCategories();
  }
}
