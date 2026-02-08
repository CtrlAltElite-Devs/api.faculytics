import { Body, Controller, Post } from '@nestjs/common';
import { LoginMoodleDto } from './dto/login-moodle.dto';
import { MoodleService } from './moodle.service';

@Controller('moodle')
export class MoodleController {
  constructor(private readonly moodleService: MoodleService) {}

  @Post('login')
  async Login(@Body() body: LoginMoodleDto) {
    return await this.moodleService.Login(body);
  }
}
