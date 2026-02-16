import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { MoodleService } from './moodle.service';
import { env } from 'src/configurations/env';
import { Program } from 'src/entities/program.entity';
import { Course } from 'src/entities/course.entity';
import UnitOfWork from '../common/unit-of-work';

@Injectable()
export class MoodleCourseSyncService {
  constructor(
    private readonly moodleService: MoodleService,
    private readonly em: EntityManager,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async syncAllPrograms(): Promise<void> {
    const em = this.em.fork();
    const programs = await em.find(Program, {});

    for (const program of programs) {
      await this.syncProgramCourses(program);
    }
  }

  private async syncProgramCourses(program: Program) {
    const remoteData = await this.moodleService.GetCoursesByCategory(
      env.MOODLE_MASTER_KEY,
      program.moodleCategoryId,
    );

    const remoteCourses = remoteData.courses;

    await this.unitOfWork.runInTransaction(async (tx) => {
      const existing = await tx.find(Course, {
        program: {
          id: program.id,
        },
      });

      const remoteIds = new Set<number>();

      for (const remote of remoteCourses) {
        remoteIds.add(remote.id);

        const data = tx.create(
          Course,
          {
            moodleCourseId: remote.id,
            shortname: remote.shortname,
            fullname: remote.fullname,
            program,
            startDate: new Date(remote.startdate * 1000),
            endDate: new Date(remote.enddate * 1000),
            isVisible: remote.visible === 1,
            timeModified: new Date(remote.timemodified * 1000),
            isActive: true,
          },
          { managed: false },
        );

        await tx.upsert(Course, data, {
          onConflictFields: ['moodleCourseId'],
          onConflictMergeFields: [
            'shortname',
            'fullname',
            'startDate',
            'endDate',
            'isVisible',
            'timeModified',
            'isActive',
            'updatedAt',
          ],
        });
      }

      // Soft-deactivate missing local courses
      for (const course of existing) {
        if (!remoteIds.has(course.moodleCourseId)) {
          course.isActive = false;
          course.isVisible = false;
          tx.persist(course);
        }
      }
    });
  }
}
