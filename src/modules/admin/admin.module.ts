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
import { QuestionnaireType } from 'src/entities/questionnaire-type.entity';
import { QuestionnaireVersion } from 'src/entities/questionnaire-version.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { QuestionnaireModule } from 'src/modules/questionnaires/questionnaires.module';
import { CommonModule } from '../common/common.module';
import DataLoaderModule from '../common/data-loaders/index.module';
import { AdminController } from './admin.controller';
import { AdminFiltersController } from './admin-filters.controller';
import { AdminGenerateController } from './admin-generate.controller';
import { AdminService } from './services/admin.service';
import { AdminFiltersService } from './services/admin-filters.service';
import { AdminGenerateService } from './services/admin-generate.service';
import { AdminNonSubmittersService } from './services/admin-non-submitters.service';
import { AdminUserService } from './services/admin-user.service';
import { CommentGeneratorService } from './services/comment-generator.service';

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
      QuestionnaireType,
      QuestionnaireVersion,
      QuestionnaireSubmission,
    ]),
    CommonModule,
    DataLoaderModule,
    QuestionnaireModule,
  ],
  controllers: [
    AdminController,
    AdminFiltersController,
    AdminGenerateController,
  ],
  providers: [
    AdminService,
    AdminFiltersService,
    AdminGenerateService,
    AdminNonSubmittersService,
    AdminUserService,
    CommentGeneratorService,
  ],
})
export class AdminModule {}
