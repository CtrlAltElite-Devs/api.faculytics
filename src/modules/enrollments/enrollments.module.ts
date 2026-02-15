import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Course } from 'src/entities/course.entity';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { CommonModule } from '../common/common.module';
import DataLoaderModule from '../common/data-loaders/index.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([Enrollment, Course]),
    CommonModule,
    DataLoaderModule,
  ],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
