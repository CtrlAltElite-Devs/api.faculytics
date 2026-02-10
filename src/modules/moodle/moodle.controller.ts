import { Body, Controller, Post } from '@nestjs/common';
import { LoginMoodleRequest } from './dto/requests/login-moodle.request.dto';
import { MoodleService } from './moodle.service';
import { GetSiteInfoRequest } from './dto/requests/get-site-info.request.dto';
import { GetEnrolledCoursesRequest } from './dto/requests/get-enrolled-courses.request.dto';
import { GetEnrolledUsersByCourseRequest } from './dto/requests/get-enrolled-users-by-course.request.dto';
import { GetCourseUserProfilesRequest } from './dto/requests/get-course-user-profiles.request.dto';

@Controller('moodle')
export class MoodleController {
  constructor(private readonly moodleService: MoodleService) {}

  @Post('login')
  async Login(@Body() body: LoginMoodleRequest) {
    return await this.moodleService.Login(body);
  }

  @Post('get-site-info')
  async GetSiteInfo(@Body() body: GetSiteInfoRequest) {
    return await this.moodleService.GetSiteInfo(body);
  }

  @Post('get-enrolled-courses')
  async GetEnrolledCourses(@Body() body: GetEnrolledCoursesRequest) {
    return await this.moodleService.GetEnrolledCourses(body);
  }

  @Post('get-enrolled-users-by-course')
  async GetEnrolledUsersByCourse(
    @Body() body: GetEnrolledUsersByCourseRequest,
  ) {
    return await this.moodleService.GetEnrolledUsersByCourse(body);
  }

  @Post('get-course-user-profiles')
  async GetCourseUserProfiles(@Body() body: GetCourseUserProfilesRequest) {
    return await this.moodleService.GetCourseUserProfiles(body);
  }
}
