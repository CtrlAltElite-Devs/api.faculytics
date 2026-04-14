import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { User } from 'src/entities/user.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Program } from 'src/entities/program.entity';
import { Semester } from 'src/entities/semester.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { MyEnrollmentsResponseDto } from 'src/modules/enrollments/dto/responses/my-enrollments.response.dto';
import { FacultyShortResponseDto } from 'src/modules/enrollments/dto/responses/faculty-short.response.dto';
import { GetFacultyEnrollmentsQueryDto } from '../dto/requests/get-faculty-enrollments-query.dto';
import { ListFacultyQueryDto } from '../dto/requests/list-faculty-query.dto';
import { FacultyListResponseDto } from '../dto/responses/faculty-list.response.dto';
import { FacultyCardResponseDto } from '../dto/responses/faculty-card.response.dto';
import { SubmissionCountResponseDto } from '../dto/responses/submission-count.response.dto';
import { Course } from 'src/entities/course.entity';
import { FilterQuery, QueryOrder } from '@mikro-orm/core';
import { EnrollmentRole } from 'src/modules/questionnaires/lib/questionnaire.types';
import { UserRole } from 'src/modules/auth/roles.enum';

@Injectable()
export class FacultyService {
  constructor(
    private readonly em: EntityManager,
    private readonly scopeResolverService: ScopeResolverService,
    private readonly currentUserService: CurrentUserService,
  ) {}

  async ListFaculty(
    query: ListFacultyQueryDto,
  ): Promise<FacultyListResponseDto> {
    // 1. Validate semester exists
    const semester = await this.em.findOne(Semester, { id: query.semesterId });
    if (!semester) {
      throw new NotFoundException(
        `Semester with id '${query.semesterId}' not found.`,
      );
    }

    // 2. Resolve scope
    const departmentIds = await this.scopeResolverService.ResolveDepartmentIds(
      query.semesterId,
    );

    // 3. Validate filters
    if (query.departmentId && departmentIds !== null) {
      if (!departmentIds.includes(query.departmentId)) {
        throw new ForbiddenException(
          'Department is outside your authorized scope.',
        );
      }
    }

    if (query.programId) {
      const program = await this.em.findOne(
        Program,
        { id: query.programId },
        { populate: ['department'] },
      );

      if (!program) {
        throw new NotFoundException(
          `Program with id '${query.programId}' not found.`,
        );
      }

      if (query.departmentId && program.department.id !== query.departmentId) {
        throw new BadRequestException(
          'Program does not belong to the specified department.',
        );
      }

      if (
        departmentIds !== null &&
        !departmentIds.includes(program.department.id)
      ) {
        throw new ForbiddenException(
          'Program is outside your authorized scope.',
        );
      }
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    // Empty scope → no home-dept matches are possible; skip DB entirely.
    if (departmentIds !== null && departmentIds.length === 0) {
      return this.EmptyListResponse(page, limit);
    }

    // 4. Query users filtered by home dept/program + role + active.
    const userFilter = this.BuildUserFilter(query, departmentIds);
    const [users, totalItems] = await this.em.findAndCount(User, userFilter, {
      limit,
      offset,
      orderBy: {
        fullName: QueryOrder.ASC_NULLS_LAST,
        id: QueryOrder.ASC,
      },
    });

    if (totalItems === 0 || users.length === 0) {
      return {
        data: [],
        meta: {
          totalItems,
          itemCount: 0,
          itemsPerPage: limit,
          totalPages: Math.ceil(totalItems / limit),
          currentPage: page,
        },
      };
    }

    // 5. Enrich with scope-visible teaching (subjects[] may be empty).
    const userIds = users.map((u) => u.id);
    const scopedEnrollments = await this.em.find(
      Enrollment,
      {
        user: { $in: userIds },
        role: {
          $in: [EnrollmentRole.EDITING_TEACHER, EnrollmentRole.TEACHER],
        },
        isActive: true,
        course: this.BuildCourseFilter(query, departmentIds),
      },
      { populate: ['course'] },
    );

    const userCourseMap = new Map<string, string[]>();
    for (const enrollment of scopedEnrollments) {
      const userId = enrollment.user.id;
      if (!userCourseMap.has(userId)) {
        userCourseMap.set(userId, []);
      }
      const shortname = enrollment.course.shortname;
      const courses = userCourseMap.get(userId)!;
      if (!courses.includes(shortname)) {
        courses.push(shortname);
      }
    }

    const userMap = new Map(users.map((u) => [u.id, u]));
    const data: FacultyCardResponseDto[] = userIds
      .map((id) => {
        const u = userMap.get(id);
        if (!u) return null;
        return FacultyCardResponseDto.Map(u, userCourseMap.get(id) ?? []);
      })
      .filter((dto): dto is FacultyCardResponseDto => dto !== null);

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async ListCrossDepartmentTeaching(
    query: ListFacultyQueryDto,
  ): Promise<FacultyListResponseDto> {
    // 1. Validate semester exists
    const semester = await this.em.findOne(Semester, { id: query.semesterId });
    if (!semester) {
      throw new NotFoundException(
        `Semester with id '${query.semesterId}' not found.`,
      );
    }

    // 2. Resolve scope
    const departmentIds = await this.scopeResolverService.ResolveDepartmentIds(
      query.semesterId,
    );

    // 3. Validate filters (same semantics as primary — departmentId/programId
    // refer to course-owning dept/program here).
    if (query.departmentId && departmentIds !== null) {
      if (!departmentIds.includes(query.departmentId)) {
        throw new ForbiddenException(
          'Department is outside your authorized scope.',
        );
      }
    }

    if (query.programId) {
      const program = await this.em.findOne(
        Program,
        { id: query.programId },
        { populate: ['department'] },
      );

      if (!program) {
        throw new NotFoundException(
          `Program with id '${query.programId}' not found.`,
        );
      }

      if (query.departmentId && program.department.id !== query.departmentId) {
        throw new BadRequestException(
          'Program does not belong to the specified department.',
        );
      }

      if (
        departmentIds !== null &&
        !departmentIds.includes(program.department.id)
      ) {
        throw new ForbiddenException(
          'Program is outside your authorized scope.',
        );
      }
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    if (departmentIds !== null && departmentIds.length === 0) {
      return this.EmptyListResponse(page, limit);
    }

    const enrollmentFilter = this.BuildEnrollmentFilter(query, departmentIds, {
      crossDeptOnly: true,
    });

    const countResult: { count: string }[] = await this.em
      .getConnection()
      .execute(
        this.BuildCountQuery(enrollmentFilter),
        this.BuildQueryParams(enrollmentFilter),
      );
    const totalItems = parseInt(countResult[0]?.count ?? '0', 10);

    if (totalItems === 0) {
      return this.EmptyListResponse(page, limit);
    }

    const userIdRows: { user_id: string }[] = await this.em
      .getConnection()
      .execute(this.BuildPaginatedUserIdQuery(enrollmentFilter), [
        ...this.BuildQueryParams(enrollmentFilter),
        limit,
        offset,
      ]);
    const userIds = userIdRows.map((row) => row.user_id);

    if (userIds.length === 0) {
      return {
        data: [],
        meta: {
          totalItems,
          itemCount: 0,
          itemsPerPage: limit,
          totalPages: Math.ceil(totalItems / limit),
          currentPage: page,
        },
      };
    }

    const [users, scopedEnrollments] = await Promise.all([
      this.em.find(User, { id: { $in: userIds } }),
      this.em.find(
        Enrollment,
        {
          user: { $in: userIds },
          role: {
            $in: [EnrollmentRole.EDITING_TEACHER, EnrollmentRole.TEACHER],
          },
          isActive: true,
          course: this.BuildCourseFilter(query, departmentIds),
        },
        { populate: ['course'] },
      ),
    ]);

    const userCourseMap = new Map<string, string[]>();
    for (const enrollment of scopedEnrollments) {
      const userId = enrollment.user.id;
      if (!userCourseMap.has(userId)) {
        userCourseMap.set(userId, []);
      }
      const shortname = enrollment.course.shortname;
      const courses = userCourseMap.get(userId)!;
      if (!courses.includes(shortname)) {
        courses.push(shortname);
      }
    }

    const userMap = new Map(users.map((u) => [u.id, u]));
    const data: FacultyCardResponseDto[] = userIds
      .map((id) => {
        const u = userMap.get(id);
        if (!u) return null;
        return FacultyCardResponseDto.Map(u, userCourseMap.get(id) ?? []);
      })
      .filter((dto): dto is FacultyCardResponseDto => dto !== null);

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async GetSubmissionCount(
    facultyId: string,
    semesterId: string,
  ): Promise<SubmissionCountResponseDto> {
    const [semester, user] = await Promise.all([
      this.em.findOne(Semester, { id: semesterId }),
      this.em.findOne(User, { id: facultyId }),
    ]);

    if (!semester) {
      throw new NotFoundException(
        `Semester with id '${semesterId}' not found.`,
      );
    }

    if (!user) {
      throw new NotFoundException(`Faculty with id '${facultyId}' not found.`);
    }

    const count = await this.em.count(QuestionnaireSubmission, {
      faculty: facultyId,
      semester: semesterId,
    });

    return { count };
  }

  async GetFacultyEnrollments(
    facultyId: string,
    query: GetFacultyEnrollmentsQueryDto,
  ): Promise<MyEnrollmentsResponseDto> {
    const semester = await this.em.findOne(Semester, { id: query.semesterId });
    if (!semester) {
      throw new NotFoundException(
        `Semester with id '${query.semesterId}' not found.`,
      );
    }

    const faculty = await this.em.findOne(
      User,
      { id: facultyId, isActive: true },
      { populate: ['department'] },
    );
    if (!faculty || !faculty.roles.includes(UserRole.FACULTY)) {
      throw new NotFoundException(`Faculty with id '${facultyId}' not found.`);
    }

    await this.AssertFacultyAccess(faculty, query.semesterId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const [enrollments, totalItems] = await this.em.findAndCount(
      Enrollment,
      {
        user: facultyId,
        role: {
          $in: [EnrollmentRole.EDITING_TEACHER, EnrollmentRole.TEACHER],
        },
        isActive: true,
        course: {
          isActive: true,
          program: { department: { semester: query.semesterId } },
        },
      },
      {
        populate: ['course.program.department.semester', 'section'],
        limit,
        offset,
        orderBy: { timeModified: QueryOrder.DESC },
      },
    );

    const facultyDto: FacultyShortResponseDto = {
      id: faculty.id,
      fullName: faculty.fullName ?? `${faculty.firstName} ${faculty.lastName}`,
      employeeNumber: faculty.userName,
      profilePicture: faculty.userProfilePicture || undefined,
    };

    return {
      data: enrollments.map((enrollment) => {
        const enrollmentSemester =
          enrollment.course.program?.department?.semester;

        return {
          id: enrollment.id,
          role: enrollment.role,
          course: {
            id: enrollment.course.id,
            moodleCourseId: enrollment.course.moodleCourseId,
            shortname: enrollment.course.shortname,
            fullname: enrollment.course.fullname,
            courseImage: enrollment.course.courseImage ?? undefined,
          },
          faculty: facultyDto,
          semester: enrollmentSemester
            ? {
                id: enrollmentSemester.id,
                code: enrollmentSemester.code,
                label: enrollmentSemester.label,
                academicYear: enrollmentSemester.academicYear,
              }
            : null,
          section: enrollment.section
            ? {
                id: enrollment.section.id,
                name: enrollment.section.name,
              }
            : null,
          submission: {
            submitted: false,
          },
        };
      }),
      meta: {
        totalItems,
        itemCount: enrollments.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  private BuildUserFilter(
    query: ListFacultyQueryDto,
    departmentIds: string[] | null,
  ): FilterQuery<User> {
    const filter: Record<string, unknown> = {
      roles: { $contains: [UserRole.FACULTY] },
      isActive: true,
    };

    // Home-dept scoping: super-admin (null scope) still excludes NULL home;
    // restricted scope narrows to the caller's departments.
    if (departmentIds === null) {
      filter.department = { $ne: null };
    } else {
      filter.department = { $in: departmentIds };
    }

    // departmentId / programId filter against home dept/program (user.*).
    if (query.departmentId) {
      filter.department = query.departmentId;
    }

    if (query.programId) {
      filter.program = query.programId;
    }

    if (query.search) {
      const escaped = this.EscapeLikeWildcards(query.search);
      filter.fullName = { $ilike: `%${escaped}%` };
    }

    return filter as FilterQuery<User>;
  }

  private EmptyListResponse(
    page: number,
    limit: number,
  ): FacultyListResponseDto {
    return {
      data: [],
      meta: {
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: limit,
        totalPages: 0,
        currentPage: page,
      },
    };
  }

  private BuildEnrollmentFilter(
    query: ListFacultyQueryDto,
    departmentIds: string[] | null,
    options: { crossDeptOnly?: boolean } = {},
  ): EnrollmentFilterParts {
    const conditions: string[] = [
      "e.role IN ('editingteacher', 'teacher')",
      'e.is_active = true',
      'e.deleted_at IS NULL',
      'u.is_active = true',
      'u.deleted_at IS NULL',
      'c.is_active = true',
      'c.deleted_at IS NULL',
      'p.deleted_at IS NULL',
      'd.deleted_at IS NULL',
      'd.semester_id = ?',
    ];
    const params: unknown[] = [query.semesterId];

    if (departmentIds !== null) {
      if (departmentIds.length === 0) {
        conditions.push('1 = 0');
      } else {
        conditions.push(`d.id IN (${departmentIds.map(() => '?').join(', ')})`);
        params.push(...departmentIds);
      }
    }

    if (query.departmentId) {
      conditions.push('d.id = ?');
      params.push(query.departmentId);
    }

    if (query.programId) {
      conditions.push('p.id = ?');
      params.push(query.programId);
    }

    if (query.search) {
      const escaped = this.EscapeLikeWildcards(query.search);
      conditions.push("u.full_name ILIKE ? ESCAPE '\\'");
      params.push(`%${escaped}%`);
    }

    if (options.crossDeptOnly) {
      // True cross-dept: home dept differs from course-owning dept, and the
      // home dept must exist + not be soft-deleted (raw SQL bypasses the
      // global MikroORM softDelete filter).
      conditions.push('u.department_id IS NOT NULL');
      conditions.push('u.department_id <> d.id');
      conditions.push(
        'EXISTS (SELECT 1 FROM department hd WHERE hd.id = u.department_id AND hd.deleted_at IS NULL)',
      );
    }

    return { conditions, params };
  }

  private BuildCountQuery(filter: EnrollmentFilterParts): string {
    return `
      SELECT COUNT(DISTINCT e.user_id) AS count
      FROM enrollment e
      INNER JOIN "user" u ON u.id = e.user_id
      INNER JOIN course c ON c.id = e.course_id
      INNER JOIN program p ON p.id = c.program_id
      INNER JOIN department d ON d.id = p.department_id
      WHERE ${filter.conditions.join(' AND ')}
    `;
  }

  private BuildPaginatedUserIdQuery(filter: EnrollmentFilterParts): string {
    return `
      SELECT e.user_id, MIN(u.full_name) AS sort_name
      FROM enrollment e
      INNER JOIN "user" u ON u.id = e.user_id
      INNER JOIN course c ON c.id = e.course_id
      INNER JOIN program p ON p.id = c.program_id
      INNER JOIN department d ON d.id = p.department_id
      WHERE ${filter.conditions.join(' AND ')}
      GROUP BY e.user_id
      ORDER BY sort_name ASC, e.user_id ASC
      LIMIT ? OFFSET ?
    `;
  }

  private BuildQueryParams(filter: EnrollmentFilterParts): unknown[] {
    return [...filter.params];
  }

  private BuildCourseFilter(
    query: ListFacultyQueryDto,
    departmentIds: string[] | null,
  ): FilterQuery<Course> {
    const departmentFilter: Record<string, unknown> = {
      semester: query.semesterId,
    };

    // Use the most specific department constraint available.
    // departmentId (already validated in scope by step 3) narrows to a single dept.
    // Otherwise, apply the full scope restriction from departmentIds.
    if (query.departmentId) {
      departmentFilter.id = query.departmentId;
    } else if (departmentIds !== null) {
      departmentFilter.id =
        departmentIds.length === 0 ? { $in: [] } : { $in: departmentIds };
    }

    const programFilter: Record<string, unknown> = {
      department: departmentFilter,
    };

    if (query.programId) {
      programFilter.id = query.programId;
    }

    return {
      isActive: true,
      program: programFilter,
    } as FilterQuery<Course>;
  }

  private EscapeLikeWildcards(input: string): string {
    return input
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
  }

  private async AssertFacultyAccess(
    faculty: User,
    semesterId: string,
  ): Promise<void> {
    const currentUser = this.currentUserService.getOrFail();

    if (currentUser.roles.includes(UserRole.SUPER_ADMIN)) {
      return;
    }

    if (
      currentUser.roles.some((role) =>
        [UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.CAMPUS_HEAD].includes(
          role,
        ),
      )
    ) {
      const departmentIds =
        await this.scopeResolverService.ResolveDepartmentIds(semesterId);

      if (departmentIds === null) {
        return;
      }

      if (
        !faculty.department?.id ||
        !departmentIds.includes(faculty.department.id)
      ) {
        throw new ForbiddenException(
          'You do not have access to this faculty member',
        );
      }

      return;
    }

    if (
      currentUser.roles.includes(UserRole.FACULTY) &&
      currentUser.id === faculty.id
    ) {
      return;
    }

    throw new ForbiddenException(
      'You do not have access to this faculty member',
    );
  }
}

interface EnrollmentFilterParts {
  conditions: string[];
  params: unknown[];
}
