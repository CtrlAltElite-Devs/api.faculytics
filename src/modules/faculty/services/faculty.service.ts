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
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { ListFacultyQueryDto } from '../dto/requests/list-faculty-query.dto';
import { FacultyListResponseDto } from '../dto/responses/faculty-list.response.dto';
import { FacultyCardResponseDto } from '../dto/responses/faculty-card.response.dto';
import { Course } from 'src/entities/course.entity';
import { FilterQuery } from '@mikro-orm/core';

@Injectable()
export class FacultyService {
  constructor(
    private readonly em: EntityManager,
    private readonly scopeResolverService: ScopeResolverService,
  ) {}

  async ListFaculty(
    user: User,
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
      user,
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

    // 4. Build enrollment filter
    const enrollmentFilter = this.BuildEnrollmentFilter(query, departmentIds);

    // 5. Get distinct faculty count

    const countResult: { count: string }[] = await this.em
      .getConnection()
      .execute(
        this.BuildCountQuery(enrollmentFilter),
        this.BuildQueryParams(enrollmentFilter),
      );
    const totalItems = parseInt(countResult[0]?.count ?? '0', 10);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    if (totalItems === 0) {
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

    // 6. Get paginated distinct faculty IDs

    const userIdRows: { user_id: string }[] = await this.em
      .getConnection()
      .execute(this.BuildPaginatedUserIdQuery(enrollmentFilter), [
        ...this.BuildQueryParams(enrollmentFilter),
        limit,
        offset,
      ]);
    const userIds = userIdRows.map((row) => row.user_id);

    // 7. Batch-fetch faculty users and their scoped enrollments
    const [users, scopedEnrollments] = await Promise.all([
      this.em.find(User, { id: { $in: userIds } }),
      this.em.find(
        Enrollment,
        {
          user: { $in: userIds },
          role: { $in: ['editingteacher', 'teacher'] },
          isActive: true,
          course: this.BuildCourseFilter(query, departmentIds),
        },
        { populate: ['course'] },
      ),
    ]);

    // 8. Map to response — group course shortnames by user
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

    // Maintain the order from the paginated query
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

  private BuildEnrollmentFilter(
    query: ListFacultyQueryDto,
    departmentIds: string[] | null,
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
}

interface EnrollmentFilterParts {
  conditions: string[];
  params: unknown[];
}
