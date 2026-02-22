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

    await this.processCampuses(tx, categories);
    await this.processSemesters(tx, categories, categoryMap);
    await this.processDepartments(tx, categories, categoryMap);
    await this.processPrograms(tx, categories, categoryMap);
  }

  private async processCampuses(
    tx: EntityManager,
    categories: MoodleCategory[],
  ) {
    const campuses = categories.filter((c) => c.depth === 1);

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
      await tx.upsert(Campus, data, {
        onConflictFields: ['moodleCategoryId'],
        onConflictMergeFields: ['code', 'name', 'updatedAt'],
      });
    }
  }

  private async processSemesters(
    tx: EntityManager,
    categories: MoodleCategory[],
    categoryMap: Map<number, MoodleCategory>,
  ) {
    const semesters = categories.filter((c) => c.depth === 2);

    for (const cat of semesters) {
      const parentCategory = categoryMap.get(cat.parentMoodleCategoryId);
      if (!parentCategory) throw new Error('Missing parent campus');

      const campus = await tx.findOneOrFail(Campus, {
        moodleCategoryId: parentCategory.moodleCategoryId,
      });

      const data = tx.create(
        Semester,
        {
          moodleCategoryId: cat.moodleCategoryId,
          code: cat.name,
          description: this.stripHtml(cat.description),
          campus,
        },
        { managed: false },
      );

      await tx.upsert(Semester, data, {
        onConflictFields: ['moodleCategoryId'],
        onConflictMergeFields: ['code', 'description', 'campus', 'updatedAt'],
      });
    }
  }

  private async processDepartments(
    tx: EntityManager,
    categories: MoodleCategory[],
    categoryMap: Map<number, MoodleCategory>,
  ) {
    const departments = categories.filter((c) => c.depth === 3);

    for (const cat of departments) {
      const parentCategory = categoryMap.get(cat.parentMoodleCategoryId);
      if (!parentCategory) throw new Error('Missing parent semester');

      const semester = await tx.findOneOrFail(Semester, {
        moodleCategoryId: parentCategory.moodleCategoryId,
      });

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

      await tx.upsert(Department, data, {
        onConflictFields: ['moodleCategoryId'],
        onConflictMergeFields: ['code', 'name', 'semester', 'updatedAt'],
      });
    }
  }

  private async processPrograms(
    tx: EntityManager,
    categories: MoodleCategory[],
    categoryMap: Map<number, MoodleCategory>,
  ) {
    const programs = categories.filter((c) => c.depth === 4);

    for (const cat of programs) {
      const parentCategory = categoryMap.get(cat.parentMoodleCategoryId);
      if (!parentCategory) throw new Error('Missing parent department');

      const department = await tx.findOneOrFail(Department, {
        moodleCategoryId: parentCategory.moodleCategoryId,
      });

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

  private stripHtml(text?: string): string | undefined {
    if (!text) return text;
    return text.replace(/<[^>]*>/g, '').trim();
  }
}
