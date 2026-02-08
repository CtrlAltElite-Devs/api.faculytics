import { Body, Controller, Post } from '@nestjs/common';
import { LoginMoodleRequest } from './dto/requests/login-moodle.request.dto';
import { MoodleService } from './moodle.service';
import { GetSiteInfoRequest } from './dto/requests/get-site-info.request.dto';
import { GetEnrolledCoursesRequest } from './dto/requests/get-enrolled-courses.request.dto';

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
}
