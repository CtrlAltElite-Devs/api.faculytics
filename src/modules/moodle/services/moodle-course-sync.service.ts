import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { env } from 'src/configurations/env';
import { Program } from 'src/entities/program.entity';
import { Course } from 'src/entities/course.entity';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';
import { SyncPhaseResult } from '../lib/sync-result.types';

@Injectable()
export class MoodleCourseSyncService {
  private readonly logger = new Logger(MoodleCourseSyncService.name);

  constructor(
    private readonly moodleService: MoodleService,
    private readonly em: EntityManager,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async SyncAllPrograms(): Promise<SyncPhaseResult> {
    const startTime = Date.now();
    const em = this.em.fork();
    const countBefore = await em.count(Course);
    const programs = await em.find(Program, {});
    const limit = pLimit(env.MOODLE_SYNC_CONCURRENCY);

    let fetched = 0;
    let upserted = 0;
    let deactivated = 0;
    let errors = 0;

    await Promise.all(
      programs.map((program) =>
        limit(async () => {
          try {
            const metrics = await this.syncProgramCourses(program);
            fetched += metrics.fetched;
            upserted += metrics.upserted;
            deactivated += metrics.deactivated;
          } catch (error: unknown) {
            errors++;
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Failed to sync courses for program ${program.code}: ${message}`,
            );
          }
        }),
      ),
    );

    const inserted = Math.max(0, upserted - countBefore);

    return {
      status: errors > 0 && upserted === 0 ? 'failed' : 'success',
      durationMs: Date.now() - startTime,
      fetched,
      inserted,
      updated: upserted - inserted,
      deactivated,
      errors,
    };
  }

  private async syncProgramCourses(
    program: Program,
  ): Promise<{ fetched: number; upserted: number; deactivated: number }> {
    const remoteData = await this.moodleService.GetCoursesByCategory(
      env.MOODLE_MASTER_KEY,
      program.moodleCategoryId,
    );

    const remoteCourses = remoteData.courses;
    let deactivated = 0;

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
            courseImage: remote.courseimage ?? null,
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
            'courseImage',
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
          deactivated++;
        }
      }
    });

    return {
      fetched: remoteCourses.length,
      upserted: remoteCourses.length,
      deactivated,
    };
  }
}
