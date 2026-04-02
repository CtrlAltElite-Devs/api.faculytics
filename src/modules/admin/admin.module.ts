import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Campus } from 'src/entities/campus.entity';
import { Course } from 'src/entities/course.entity';
import { Department } from 'src/entities/department.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { Program } from 'src/entities/program.entity';
import { Semester } from 'src/entities/semester.entity';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { User } from 'src/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminFiltersController } from './admin-filters.controller';
import { AdminService } from './services/admin.service';
import { AdminFiltersService } from './services/admin-filters.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      Campus,
      Course,
      Department,
      Enrollment,
      MoodleCategory,
      Program,
      Semester,
      UserInstitutionalRole,
      User,
    ]),
  ],
  controllers: [AdminController, AdminFiltersController],
  providers: [AdminService, AdminFiltersService],
})
export class AdminModule {}
