import {
  ConflictException,
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MoodleService } from '../moodle.service';
import { MoodleCourseTransformService } from './moodle-course-transform.service';
import { MoodleCsvParserService } from './moodle-csv-parser.service';
import { MoodleCategorySyncService } from './moodle-category-sync.service';
import { MoodleCategoryResponse } from '../lib/moodle.types';
import {
  MoodleCategoryTreeNodeDto,
  MoodleCategoryTreeResponseDto,
} from '../dto/responses/moodle-tree.response.dto';
import {
  MoodleCoursePreviewDto,
  MoodleCategoryCoursesResponseDto,
} from '../dto/responses/moodle-course-preview.response.dto';
import { env } from 'src/configurations/env';
import { Program } from 'src/entities/program.entity';
import {
  MOODLE_PROVISION_BATCH_SIZE,
  ProvisionCategoriesInput,
  ProvisionResult,
  ProvisionDetailItem,
  CoursePreviewResult,
  SeedContext,
  ConfirmedCourseRow,
  QuickCourseInput,
  SeedUsersInput,
  SeedUsersResult,
  CoursePreviewRow,
  SeedUserRecord,
} from '../lib/provisioning.types';

@Injectable()
export class MoodleProvisioningService {
  private readonly logger = new Logger(MoodleProvisioningService.name);
  private readonly activeOps = new Set<string>();

  constructor(
    private readonly moodleService: MoodleService,
    private readonly em: EntityManager,
    private readonly transformService: MoodleCourseTransformService,
    private readonly csvParser: MoodleCsvParserService,
    private readonly categorySyncService: MoodleCategorySyncService,
  ) {}

  async ProvisionCategories(
    input: ProvisionCategoriesInput,
  ): Promise<ProvisionResult> {
    this.acquireGuard('categories');
    const start = Date.now();
    const details: ProvisionDetailItem[] = [];

    try {
      const existing = await this.moodleService.GetCategoriesWithMasterKey();
      const existingByParentAndName = new Map<string, MoodleCategoryResponse>();
      for (const cat of existing) {
        existingByParentAndName.set(`${cat.parent}:${cat.name}`, cat);
      }

      const startYY = input.startDate.slice(2, 4);
      const endYY = input.endDate.slice(2, 4);

      // Depth 1: Campuses
      const campusIds = new Map<string, number>();
      const missingCampuses = input.campuses.filter((c) => {
        const key = `0:${c.toUpperCase()}`;
        const found = existingByParentAndName.get(key);
        if (found) {
          campusIds.set(c.toUpperCase(), found.id);
          details.push({ name: c.toUpperCase(), status: 'skipped' });
          return false;
        }
        return true;
      });

      if (missingCampuses.length > 0) {
        try {
          const results = await this.moodleService.CreateCategories(
            missingCampuses.map((c) => ({ name: c.toUpperCase(), parent: 0 })),
          );
          for (const r of results) {
            campusIds.set(r.name, r.id);
            details.push({ name: r.name, status: 'created', moodleId: r.id });
          }
        } catch (err) {
          for (const c of missingCampuses) {
            details.push({
              name: c.toUpperCase(),
              status: 'error',
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Depth 2: Semesters (batched)
      const semesterIds = new Map<string, number>();
      const missingSemesters: {
        name: string;
        parent: number;
        compositeKey: string;
      }[] = [];
      for (const campus of input.campuses) {
        const campusId = campusIds.get(campus.toUpperCase());
        if (!campusId) continue;
        for (const sem of input.semesters) {
          const tag = this.transformService.BuildSemesterTag(
            String(sem),
            startYY,
            endYY,
          );
          const key = `${campusId}:${tag}`;
          const compositeKey = `${campus.toUpperCase()}:${tag}`;
          const found = existingByParentAndName.get(key);
          if (found) {
            semesterIds.set(compositeKey, found.id);
            details.push({ name: tag, status: 'skipped' });
          } else {
            missingSemesters.push({
              name: tag,
              parent: campusId,
              compositeKey,
            });
          }
        }
      }
      if (missingSemesters.length > 0) {
        try {
          const results = await this.moodleService.CreateCategories(
            missingSemesters.map((s) => ({ name: s.name, parent: s.parent })),
          );
          for (let i = 0; i < results.length; i++) {
            semesterIds.set(missingSemesters[i].compositeKey, results[i].id);
            details.push({
              name: results[i].name,
              status: 'created',
              moodleId: results[i].id,
            });
          }
        } catch (err) {
          for (const s of missingSemesters) {
            details.push({
              name: s.name,
              status: 'error',
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Depth 3: Departments (batched)
      const deptIds = new Map<string, number>();
      const missingDepts: {
        name: string;
        parent: number;
        compositeKey: string;
      }[] = [];
      for (const campus of input.campuses) {
        for (const sem of input.semesters) {
          const tag = this.transformService.BuildSemesterTag(
            String(sem),
            startYY,
            endYY,
          );
          const semId = semesterIds.get(`${campus.toUpperCase()}:${tag}`);
          if (!semId) continue;
          for (const dept of input.departments) {
            const deptName = dept.code.toUpperCase();
            const key = `${semId}:${deptName}`;
            const compositeKey = `${campus.toUpperCase()}:${tag}:${deptName}`;
            const found = existingByParentAndName.get(key);
            if (found) {
              deptIds.set(compositeKey, found.id);
              details.push({ name: deptName, status: 'skipped' });
            } else {
              missingDepts.push({
                name: deptName,
                parent: semId,
                compositeKey,
              });
            }
          }
        }
      }
      if (missingDepts.length > 0) {
        try {
          const results = await this.moodleService.CreateCategories(
            missingDepts.map((d) => ({ name: d.name, parent: d.parent })),
          );
          for (let i = 0; i < results.length; i++) {
            deptIds.set(missingDepts[i].compositeKey, results[i].id);
            details.push({
              name: results[i].name,
              status: 'created',
              moodleId: results[i].id,
            });
          }
        } catch (err) {
          for (const d of missingDepts) {
            details.push({
              name: d.name,
              status: 'error',
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Depth 4: Programs (batched)
      const missingProgs: { name: string; parent: number }[] = [];
      for (const campus of input.campuses) {
        for (const sem of input.semesters) {
          const tag = this.transformService.BuildSemesterTag(
            String(sem),
            startYY,
            endYY,
          );
          for (const dept of input.departments) {
            const deptName = dept.code.toUpperCase();
            const deptId = deptIds.get(
              `${campus.toUpperCase()}:${tag}:${deptName}`,
            );
            if (!deptId) continue;
            for (const prog of dept.programs) {
              const progName = prog.toUpperCase();
              const key = `${deptId}:${progName}`;
              const found = existingByParentAndName.get(key);
              if (found) {
                details.push({ name: progName, status: 'skipped' });
              } else {
                missingProgs.push({ name: progName, parent: deptId });
              }
            }
          }
        }
      }
      if (missingProgs.length > 0) {
        try {
          const results = await this.moodleService.CreateCategories(
            missingProgs.map((p) => ({ name: p.name, parent: p.parent })),
          );
          for (const r of results) {
            details.push({ name: r.name, status: 'created', moodleId: r.id });
          }
        } catch (err) {
          for (const p of missingProgs) {
            details.push({
              name: p.name,
              status: 'error',
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Auto-sync local entities
      let syncCompleted = true;
      try {
        await this.categorySyncService.SyncAndRebuildHierarchy();
      } catch (err) {
        syncCompleted = false;
        this.logger.warn(
          'Auto-sync failed after category provisioning',
          err instanceof Error ? err.message : String(err),
        );
      }

      const created = details.filter((d) => d.status === 'created').length;
      const skipped = details.filter((d) => d.status === 'skipped').length;
      const errors = details.filter((d) => d.status === 'error').length;

      return {
        created,
        skipped,
        errors,
        details,
        durationMs: Date.now() - start,
        syncCompleted,
      };
    } finally {
      this.releaseGuard('categories');
    }
  }

  async PreviewCourses(
    file: Buffer,
    context: SeedContext,
  ): Promise<CoursePreviewResult> {
    const { rows, warnings, errors } = this.csvParser.Parse(file);

    const valid: CoursePreviewRow[] = [];
    const skipped = [
      ...warnings.map((w) => ({
        rowNumber: w.rowNumber,
        courseCode: w.courseCode,
        reason: w.reason,
      })),
    ];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const preview = this.transformService.ComputePreview(row, context);

      const program = await this.em.findOne(Program, {
        code: row.program.toUpperCase(),
        department: {
          code: context.department.toUpperCase(),
          semester: { campus: { code: context.campus.toUpperCase() } },
        },
      });

      if (!program?.moodleCategoryId) {
        skipped.push({
          rowNumber: i + 2,
          courseCode: row.courseCode,
          reason: `Category not found: ${preview.categoryPath}. Provision categories first.`,
        });
        continue;
      }

      preview.categoryId = program.moodleCategoryId;
      valid.push(preview);
    }

    return {
      valid,
      skipped,
      errors,
      shortnameNote:
        'EDP codes are examples. Final codes are generated at execution time.',
    };
  }

  async ExecuteCourseSeeding(
    confirmedRows: ConfirmedCourseRow[],
    context: SeedContext,
  ): Promise<ProvisionResult> {
    this.acquireGuard('courses');
    const start = Date.now();
    const details: ProvisionDetailItem[] = [];

    try {
      const courseInputs = confirmedRows.map((row) => {
        const shortname = this.transformService.GenerateShortname(
          context.campus,
          row.semester,
          context.startYY,
          context.endYY,
          row.courseCode,
        );

        const dates = this.transformService.GetSemesterDates(
          row.semester,
          context.startYear,
          context.endYear,
        );

        return {
          shortname,
          fullname: row.descriptiveTitle,
          categoryid: row.categoryId,
          startdate: dates
            ? Math.floor(new Date(dates.startDate).getTime() / 1000)
            : undefined,
          enddate: dates
            ? Math.floor(new Date(dates.endDate).getTime() / 1000)
            : undefined,
        };
      });

      for (
        let i = 0;
        i < courseInputs.length;
        i += MOODLE_PROVISION_BATCH_SIZE
      ) {
        const batch = courseInputs.slice(i, i + MOODLE_PROVISION_BATCH_SIZE);
        try {
          const results = await this.moodleService.CreateCourses(batch);
          for (const r of results) {
            details.push({
              name: r.shortname,
              status: 'created',
              moodleId: r.id,
            });
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          for (const item of batch) {
            details.push({ name: item.shortname, status: 'error', reason });
          }
        }
      }

      return {
        created: details.filter((d) => d.status === 'created').length,
        skipped: 0,
        errors: details.filter((d) => d.status === 'error').length,
        details,
        durationMs: Date.now() - start,
      };
    } finally {
      this.releaseGuard('courses');
    }
  }

  PreviewQuickCourse(input: QuickCourseInput): CoursePreviewRow {
    const startYear = input.startDate.slice(0, 4);
    const endYear = input.endDate.slice(0, 4);
    const startYY = startYear.slice(-2);
    const endYY = endYear.slice(-2);
    const sem = String(input.semester);

    return {
      shortname: this.transformService.GenerateShortname(
        input.campus,
        sem,
        startYY,
        endYY,
        input.courseCode,
      ),
      fullname: input.descriptiveTitle,
      categoryPath: this.transformService.BuildCategoryPath(
        input.campus,
        sem,
        input.department,
        input.program,
        startYY,
        endYY,
      ),
      categoryId: 0,
      startDate:
        this.transformService.GetSemesterDates(sem, startYear, endYear)
          ?.startDate ?? '',
      endDate:
        this.transformService.GetSemesterDates(sem, startYear, endYear)
          ?.endDate ?? '',
      program: input.program,
      semester: sem,
      courseCode: input.courseCode,
    };
  }

  async ExecuteQuickCourse(input: QuickCourseInput): Promise<ProvisionResult> {
    this.acquireGuard('courses');
    const start = Date.now();

    try {
      const startYear = input.startDate.slice(0, 4);
      const endYear = input.endDate.slice(0, 4);
      const startYY = startYear.slice(-2);
      const endYY = endYear.slice(-2);
      const sem = String(input.semester);

      const dates = this.transformService.GetSemesterDates(
        sem,
        startYear,
        endYear,
      );
      if (!dates) {
        throw new BadRequestException(
          `Invalid semester ${input.semester}. Must be 1 or 2.`,
        );
      }

      const program = await this.em.findOne(Program, {
        code: input.program.toUpperCase(),
        department: {
          code: input.department.toUpperCase(),
          semester: { campus: { code: input.campus.toUpperCase() } },
        },
      });

      if (!program?.moodleCategoryId) {
        throw new BadRequestException(
          `Category not found for ${input.campus}/${input.department}/${input.program}. Provision categories first.`,
        );
      }

      const shortname = this.transformService.GenerateShortname(
        input.campus,
        sem,
        startYY,
        endYY,
        input.courseCode,
      );

      const results = await this.moodleService.CreateCourses([
        {
          shortname,
          fullname: input.descriptiveTitle,
          categoryid: program.moodleCategoryId,
          startdate: Math.floor(new Date(dates.startDate).getTime() / 1000),
          enddate: Math.floor(new Date(dates.endDate).getTime() / 1000),
        },
      ]);

      return {
        created: 1,
        skipped: 0,
        errors: 0,
        details: [
          {
            name: results[0].shortname,
            status: 'created',
            moodleId: results[0].id,
          },
        ],
        durationMs: Date.now() - start,
      };
    } finally {
      this.releaseGuard('courses');
    }
  }

  async SeedUsers(input: SeedUsersInput): Promise<SeedUsersResult> {
    this.acquireGuard('users');
    const start = Date.now();
    const warnings: string[] = [];

    try {
      // Generate fake users
      const usernameSet = new Set<string>();
      const users: SeedUserRecord[] = [];

      for (let i = 0; i < input.count; i++) {
        let user: SeedUserRecord | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          const candidate = this.transformService.GenerateFakeUser(
            input.campus,
            input.role,
          );
          if (!usernameSet.has(candidate.username)) {
            usernameSet.add(candidate.username);
            user = candidate;
            break;
          }
        }
        if (!user) {
          warnings.push(`Failed to generate unique username for user ${i + 1}`);
          continue;
        }
        users.push(user);
      }

      // Create users in Moodle in batches
      const createdUsers: { id: number; username: string }[] = [];
      let usersFailed = 0;

      for (let i = 0; i < users.length; i += MOODLE_PROVISION_BATCH_SIZE) {
        const batch = users.slice(i, i + MOODLE_PROVISION_BATCH_SIZE);
        try {
          const results = await this.moodleService.CreateUsers(
            batch.map((u) => ({
              username: u.username,
              password: u.password,
              firstname: u.firstname,
              lastname: u.lastname,
              email: u.email,
            })),
          );
          for (const r of results) {
            createdUsers.push({ id: r.id, username: r.username });
          }
        } catch (err) {
          usersFailed += batch.length;
          warnings.push(
            `Batch creation failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Enrol users
      const roleid =
        input.role === 'student'
          ? env.MOODLE_ROLE_ID_STUDENT
          : env.MOODLE_ROLE_ID_EDITING_TEACHER;

      let enrolmentsCreated = 0;

      if (createdUsers.length > 0 && input.courseIds.length > 0) {
        const enrolments = createdUsers.flatMap((user) =>
          input.courseIds.map((courseId) => ({
            userid: user.id,
            courseid: courseId,
            roleid,
          })),
        );

        for (
          let i = 0;
          i < enrolments.length;
          i += MOODLE_PROVISION_BATCH_SIZE
        ) {
          const batch = enrolments.slice(i, i + MOODLE_PROVISION_BATCH_SIZE);
          try {
            const result = await this.moodleService.EnrolUsers(batch);
            if (result?.warnings?.length) {
              for (const w of result.warnings) {
                warnings.push(`Enrolment warning: ${w.message}`);
              }
            }
            enrolmentsCreated += batch.length;
          } catch (err) {
            warnings.push(
              `Enrolment batch failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      return {
        usersCreated: createdUsers.length,
        usersFailed,
        enrolmentsCreated,
        warnings,
        durationMs: Date.now() - start,
      };
    } finally {
      this.releaseGuard('users');
    }
  }

  async GetCategoryTree(): Promise<MoodleCategoryTreeResponseDto> {
    const flat = await this.moodleService.GetCategoriesWithMasterKey();

    // Pass 1: create nodes + track sortorder
    const nodeMap = new Map<number, MoodleCategoryTreeNodeDto>();
    const sortorderMap = new Map<number, number>();
    for (const cat of flat) {
      const node: MoodleCategoryTreeNodeDto = {
        id: cat.id,
        name: cat.name,
        depth: cat.depth,
        coursecount: cat.coursecount,
        visible: cat.visible,
        children: [],
      };
      nodeMap.set(cat.id, node);
      sortorderMap.set(cat.id, cat.sortorder);
    }

    // Pass 2: attach children
    const rootNodes: MoodleCategoryTreeNodeDto[] = [];
    for (const cat of flat) {
      const node = nodeMap.get(cat.id)!;
      if (cat.parent === 0) {
        rootNodes.push(node);
      } else {
        const parent = nodeMap.get(cat.parent);
        if (parent) {
          parent.children.push(node);
        }
      }
    }

    // Pass 3: sort children by sortorder
    const sortByOrder = (
      a: MoodleCategoryTreeNodeDto,
      b: MoodleCategoryTreeNodeDto,
    ) => (sortorderMap.get(a.id) ?? 0) - (sortorderMap.get(b.id) ?? 0);

    for (const node of nodeMap.values()) {
      if (node.children.length > 1) {
        node.children.sort(sortByOrder);
      }
    }
    rootNodes.sort(sortByOrder);

    return {
      tree: rootNodes,
      fetchedAt: new Date().toISOString(),
      totalCategories: flat.length,
    };
  }

  async GetCoursesByCategoryWithMasterKey(
    categoryId: number,
  ): Promise<MoodleCategoryCoursesResponseDto> {
    const { courses } = await this.moodleService.GetCoursesByFieldWithMasterKey(
      'category',
      categoryId.toString(),
    );

    const mapped: MoodleCoursePreviewDto[] = courses.map((c) => ({
      id: c.id,
      shortname: c.shortname,
      fullname: c.fullname,
      enrolledusercount: c.enrolledusercount ?? undefined,
      visible: c.visible,
      startdate: c.startdate,
      enddate: c.enddate,
    }));

    return { categoryId, courses: mapped };
  }

  private acquireGuard(opType: string) {
    if (this.activeOps.has(opType)) {
      throw new ConflictException(
        'A provisioning operation is already in progress',
      );
    }
    this.activeOps.add(opType);
  }

  private releaseGuard(opType: string) {
    this.activeOps.delete(opType);
  }
}
