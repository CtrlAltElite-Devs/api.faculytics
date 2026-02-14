import { Module } from '@nestjs/common';
import { MoodleController } from './moodle.controller';
import { MoodleService } from './moodle.service';
import { CommonModule } from '../common/common.module';
import { MoodleSyncService } from './moodle-sync.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from '../../entities/user.entity';
import { MoodleCategorySyncService } from './moodle-category-sync.service';
import { Campus } from 'src/entities/campus.entity';
import { Semester } from 'src/entities/semester.entity';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([User, Campus, Semester, Department, Program]),
    CommonModule,
  ],
  controllers: [MoodleController],
  providers: [MoodleService, MoodleSyncService, MoodleCategorySyncService],
  exports: [MoodleService, MoodleSyncService, MoodleCategorySyncService],
})
export default class MoodleModule {}
