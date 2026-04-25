import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { env } from 'src/configurations/env';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { Campus } from 'src/entities/campus.entity';
import { Semester } from 'src/entities/semester.entity';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { MoodleCategoryResponse } from '../lib/moodle.types';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';
import { SyncPhaseResult } from '../lib/sync-result.types';

@Injectable()
export class MoodleCategorySyncService {
  constructor(
    private readonly moodleService: MoodleService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async SyncAndRebuildHierarchy(): Promise<SyncPhaseResult> {
    const startTime = Date.now();
    try {
      const result = await this.unitOfWork.runInTransaction(async (tx) => {
        const countBefore = await tx.count(MoodleCategory);

        const remoteCategories = await this.moodleService.GetCategories({
          token: env.MOODLE_MASTER_KEY,
        });

        // Phase 1: Raw mirror sync
        await this.syncRawCategories(tx, remoteCategories);

        // Phase 2: Rebuild normalized hierarchy
        await this.rebuildHierarchy(tx);

        const upserted = remoteCategories.length;
        const inserted = Math.max(0, upserted - countBefore);

        return {
          fetched: remoteCategories.length,
          inserted,
          updated: upserted - inserted,
        };
      });

      return {
        status: 'success',
        durationMs: Date.now() - startTime,
        fetched: result.fetched,
        inserted: result.inserted,
        updated: result.updated,
        deactivated: 0,
        errors: 0,
      };
    } catch (error: unknown) {
      return {
        status: 'failed',
        durationMs: Date.now() - startTime,
        fetched: 0,
        inserted: 0,
        updated: 0,
        deactivated: 0,
        errors: 1,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async syncRawCategories(
    tx: EntityManager,
    remoteCategories: MoodleCategoryResponse[],
  ) {
    for (const cat of remoteCategories) {
      const data = tx.create(
        MoodleCategory,
        {
          moodleCategoryId: cat.id,
          name: cat.name,
          description: cat.description,
          parentMoodleCategoryId: cat.parent,
          depth: cat.depth,
          path: cat.path,
          sortOrder: cat.sortorder,
          isVisible: cat.visible === 1,
          timeModified: new Date(cat.timemodified * 1000),
        },
        { managed: false },
      );

      await tx.upsert(MoodleCategory, data, {
        onConflictFields: ['moodleCategoryId'],
        onConflictMergeFields: [
          'name',
          'description',
          'parentMoodleCategoryId',
          'depth',
          'path',
          'sortOrder',
          'isVisible',
          'timeModified',
          'updatedAt',
        ],
      });
    }
  }

  private async rebuildHierarchy(tx: EntityManager) {
    const categories = await tx.find(
      MoodleCategory,
      {},
      {
        orderBy: { depth: 'asc' },
      },
    );

    const categoryMap = new Map(categories.map((c) => [c.moodleCategoryId, c]));

    const campusMap = await this.processCampuses(tx, categories);
    const semesterMap = await this.processSemesters(
      tx,
      categories,
      categoryMap,
      campusMap,
    );
    const departmentMap = await this.processDepartments(
      tx,
      categories,
      categoryMap,
      semesterMap,
    );
    await this.processPrograms(tx, categories, categoryMap, departmentMap);
  }

  private async processCampuses(
    tx: EntityManager,
    categories: MoodleCategory[],
  ): Promise<Map<number, Campus>> {
    const campuses = categories.filter((c) => c.depth === 1);
    const campusMap = new Map<number, Campus>();

    for (const cat of campuses) {
      const data = tx.create(
        Campus,
        {
          moodleCategoryId: cat.moodleCategoryId,
          code: cat.name,
          name: this.stripHtml(cat.description ?? cat.name),
        },
        { managed: false },
      );
      const campus = await tx.upsert(Campus, data, {
        onConflictFields: ['moodleCategoryId'],
        onConflictMergeFields: ['code', 'name', 'updatedAt'],
      });
      campusMap.set(cat.moodleCategoryId, campus);
    }

    return campusMap;
  }

  private async processSemesters(
    tx: EntityManager,
    categories: MoodleCategory[],
    categoryMap: Map<number, MoodleCategory>,
    campusMap: Map<number, Campus>,
  ): Promise<Map<number, Semester>> {
    const semesters = categories.filter((c) => c.depth === 2);
    const semesterMap = new Map<number, Semester>();

    for (const cat of semesters) {
      const parentCategory = categoryMap.get(cat.parentMoodleCategoryId);
      if (!parentCategory) throw new Error('Missing parent campus');

      const campus = campusMap.get(parentCategory.moodleCategoryId);
      if (!campus) throw new Error('Missing campus in map');

      const { label, academicYear, startDate, endDate } =
        this.parseSemesterCode(cat.name);

      const data = tx.create(
        Semester,
        {
          moodleCategoryId: cat.moodleCategoryId,
          code: cat.name,
          label,
          academicYear,
          startDate: startDate ?? new Date(),
          endDate,
          description: this.stripHtml(cat.description),
          campus,
        },
        { managed: false },
      );

      const semester = await tx.upsert(Semester, data, {
        onConflictFields: ['moodleCategoryId'],
        onConflictMergeFields: [
          'code',
          'label',
          'academicYear',
          'startDate',
          'endDate',
          'description',
          'campus',
          'updatedAt',
        ],
      });
      semesterMap.set(cat.moodleCategoryId, semester);
    }

    return semesterMap;
  }

  private async processDepartments(
    tx: EntityManager,
    categories: MoodleCategory[],
    categoryMap: Map<number, MoodleCategory>,
    semesterMap: Map<number, Semester>,
  ): Promise<Map<number, Department>> {
    const departments = categories.filter((c) => c.depth === 3);
    const departmentMap = new Map<number, Department>();

    for (const cat of departments) {
      const parentCategory = categoryMap.get(cat.parentMoodleCategoryId);
      if (!parentCategory) throw new Error('Missing parent semester');

      const semester = semesterMap.get(parentCategory.moodleCategoryId);
      if (!semester) throw new Error('Missing semester in map');

      const data = tx.create(
        Department,
        {
          moodleCategoryId: cat.moodleCategoryId,
          code: cat.name,
          name: this.stripHtml(cat.description ?? cat.name),
          semester,
        },
        { managed: false },
      );

      const department = await tx.upsert(Department, data, {
        onConflictFields: ['moodleCategoryId'],
        onConflictMergeFields: ['code', 'name', 'semester', 'updatedAt'],
      });
      departmentMap.set(cat.moodleCategoryId, department);
    }

    return departmentMap;
  }

  private async processPrograms(
    tx: EntityManager,
    categories: MoodleCategory[],
    categoryMap: Map<number, MoodleCategory>,
    departmentMap: Map<number, Department>,
  ) {
    const programs = categories.filter((c) => c.depth === 4);

    for (const cat of programs) {
      const parentCategory = categoryMap.get(cat.parentMoodleCategoryId);
      if (!parentCategory) throw new Error('Missing parent department');

      const department = departmentMap.get(parentCategory.moodleCategoryId);
      if (!department) throw new Error('Missing department in map');

      const data = tx.create(
        Program,
        {
          moodleCategoryId: cat.moodleCategoryId,
          code: cat.name,
          name: this.stripHtml(cat.description ?? cat.name),
          department,
        },
        { managed: false },
      );

      await tx.upsert(Program, data, {
        onConflictFields: ['moodleCategoryId'],
        onConflictMergeFields: ['code', 'name', 'department', 'updatedAt'],
      });
    }
  }

  /**
   * Parses a semester code like "S22526" into label, academic year, and dates.
   * Format: S{semester}{YY1}{YY2} → Semester {semester}, 20{YY1}-20{YY2}.
   *
   * Calendar mirrors `admin.faculytics/src/lib/constants.ts` getSemesterDates():
   *   Sem 1: Aug 1  – Dec 18 of startYear
   *   Sem 2: Jan 20 – Jun 1  of endYear
   *   Sem 3: Jun 15 – Jul 31 of endYear (intersession)
   * Unknown semester numbers get a best-effort start of Aug 1 of startYear so
   * ordering still places them sensibly within the academic year.
   */
  private parseSemesterCode(code: string): {
    label: string | undefined;
    academicYear: string | undefined;
    startDate: Date | undefined;
    endDate: Date | undefined;
  } {
    const match = code.match(/^S(\d)(\d{2})(\d{2})$/);
    if (!match) {
      return {
        label: undefined,
        academicYear: undefined,
        startDate: undefined,
        endDate: undefined,
      };
    }

    const [, semester, startYY, endYY] = match;
    const startYear = 2000 + parseInt(startYY, 10);
    const endYear = 2000 + parseInt(endYY, 10);

    let startDate: Date;
    let endDate: Date | undefined;
    if (semester === '1') {
      startDate = new Date(Date.UTC(startYear, 7, 1));
      endDate = new Date(Date.UTC(startYear, 11, 18));
    } else if (semester === '2') {
      startDate = new Date(Date.UTC(endYear, 0, 20));
      endDate = new Date(Date.UTC(endYear, 5, 1));
    } else if (semester === '3') {
      startDate = new Date(Date.UTC(endYear, 5, 15));
      endDate = new Date(Date.UTC(endYear, 6, 31));
    } else {
      startDate = new Date(Date.UTC(startYear, 7, 1));
      endDate = undefined;
    }

    return {
      label: `Semester ${semester}`,
      academicYear: `20${startYY}-20${endYY}`,
      startDate,
      endDate,
    };
  }

  private stripHtml(text?: string): string | undefined {
    if (!text) return text;
    return text.replace(/<[^>]*>/g, '').trim();
  }
}
