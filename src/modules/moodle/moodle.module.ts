import { Module } from '@nestjs/common';
import { MoodleController } from './moodle.controller';
import { MoodleService } from './moodle.service';
import { CommonModule } from '../common/common.module';
import { MoodleSyncService } from './moodle-sync.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from '../../entities/user.entity';

@Module({
  imports: [MikroOrmModule.forFeature([User]), CommonModule],
  controllers: [MoodleController],
  providers: [MoodleService, MoodleSyncService],
  exports: [MoodleService, MoodleSyncService],
})
export default class MoodleModule {}
