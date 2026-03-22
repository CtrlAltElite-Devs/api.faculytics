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

@Injectable()
export class MoodleCategorySyncService {
  constructor(
    private readonly moodleService: MoodleService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async SyncAndRebuildHierarchy(): Promise<void> {
    return await this.unitOfWork.runInTransaction(async (tx) => {
      const remoteCategories = await this.moodleService.GetCategories({
        token: env.MOODLE_MASTER_KEY,
      });

      // Phase 1: Raw mirror sync
      await this.syncRawCategories(tx, remoteCategories);

      // Phase 2: Rebuild normalized hierarchy
      await this.rebuildHierarchy(tx);
    });
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

      const { label, academicYear } = this.parseSemesterCode(cat.name);

      const data = tx.create(
        Semester,
        {
          moodleCategoryId: cat.moodleCategoryId,
          code: cat.name,
          label,
          academicYear,
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
   * Parses a semester code like "S22526" into label and academic year.
   * Format: S{semester}{YY1}{YY2} → Semester {semester}, 20{YY1}-20{YY2}
   */
  private parseSemesterCode(code: string): {
    label: string | undefined;
    academicYear: string | undefined;
  } {
    const match = code.match(/^S(\d)(\d{2})(\d{2})$/);
    if (!match) return { label: undefined, academicYear: undefined };

    const [, semester, startYear, endYear] = match;
    return {
      label: `Semester ${semester}`,
      academicYear: `20${startYear}-20${endYear}`,
    };
  }

  private stripHtml(text?: string): string | undefined {
    if (!text) return text;
    return text.replace(/<[^>]*>/g, '').trim();
  }
}
