import { Module } from '@nestjs/common';
import { MoodleController } from './moodle.controller';
import { MoodleService } from './moodle.service';

@Module({
  controllers: [MoodleController],
  providers: [MoodleService],
  exports: [MoodleService],
})
export default class MoodleModule {}
