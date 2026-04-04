import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { FilterQuery, QueryOrder } from '@mikro-orm/core';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { Course } from 'src/entities/course.entity';
import { Semester } from 'src/entities/semester.entity';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { ListDepartmentsQueryDto } from '../dto/requests/list-departments-query.dto';
import { ListProgramsQueryDto } from '../dto/requests/list-programs-query.dto';
import { ListCoursesQueryDto } from '../dto/requests/list-courses-query.dto';
import { DepartmentItemResponseDto } from '../dto/responses/department-item.response.dto';
import { DepartmentListResponseDto } from '../dto/responses/department-list.response.dto';
import { ProgramItemResponseDto } from '../dto/responses/program-item.response.dto';
import { ProgramListResponseDto } from '../dto/responses/program-list.response.dto';
import { CourseItemResponseDto } from '../dto/responses/course-item.response.dto';
import { CourseListResponseDto } from '../dto/responses/course-list.response.dto';

@Injectable()
export class CurriculumService {
  constructor(
    private readonly em: EntityManager,
    private readonly scopeResolverService: ScopeResolverService,
  ) {}

  async ListDepartments(
    query: ListDepartmentsQueryDto,
  ): Promise<DepartmentListResponseDto> {
    await this.ValidateSemester(query.semesterId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const departmentIds = await this.scopeResolverService.ResolveDepartmentIds(
      query.semesterId,
    );

    const filter: FilterQuery<Department> = {
      semester: query.semesterId,
    };

    if (departmentIds !== null) {
      if (departmentIds.length === 0) {
        return this.BuildEmptyPage(page, limit);
      }
      Object.assign(filter, { id: { $in: departmentIds } });
    }

    this.ApplySearchFilter(filter, query.search, ['code', 'name']);

    const [departments, totalItems] = await this.em.findAndCount(
      Department,
      filter,
      {
        orderBy: { name: QueryOrder.ASC_NULLS_LAST },
        limit,
        offset,
      },
    );

    return {
      data: departments.map((d) => DepartmentItemResponseDto.Map(d)),
      meta: {
        totalItems,
        itemCount: departments.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async ListPrograms(
    query: ListProgramsQueryDto,
  ): Promise<ProgramListResponseDto> {
    await this.ValidateSemester(query.semesterId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const departmentIds = await this.scopeResolverService.ResolveDepartmentIds(
      query.semesterId,
    );

    if (query.departmentId && departmentIds !== null) {
      if (!departmentIds.includes(query.departmentId)) {
        throw new ForbiddenException(
          'Department is outside your authorized scope.',
        );
      }
    }

    const departmentFilter: FilterQuery<Department> = {
      semester: query.semesterId,
    };

    if (query.departmentId) {
      departmentFilter.id = query.departmentId;
    } else if (departmentIds !== null) {
      if (departmentIds.length === 0) {
        return this.BuildEmptyPage(page, limit);
      }
      departmentFilter.id = { $in: departmentIds };
    }

    const filter: FilterQuery<Program> = {
      department: departmentFilter,
    };

    const programIds = await this.scopeResolverService.ResolveProgramIds(
      query.semesterId,
    );
    if (programIds !== null) {
      if (programIds.length === 0) {
        return this.BuildEmptyPage(page, limit);
      }
      filter.id = { $in: programIds };
    }

    this.ApplySearchFilter(filter, query.search, ['code', 'name']);

    const [programs, totalItems] = await this.em.findAndCount(Program, filter, {
      populate: ['department'],
      orderBy: { name: QueryOrder.ASC_NULLS_LAST },
      limit,
      offset,
    });

    return {
      data: programs.map((p) => ProgramItemResponseDto.Map(p)),
      meta: {
        totalItems,
        itemCount: programs.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async ListCourses(
    query: ListCoursesQueryDto,
  ): Promise<CourseListResponseDto> {
    await this.ValidateSemester(query.semesterId);

    if (!query.programId && !query.departmentId) {
      throw new BadRequestException(
        'At least one of programId or departmentId is required.',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const departmentIds = await this.scopeResolverService.ResolveDepartmentIds(
      query.semesterId,
    );

    // Validate departmentId in scope
    if (query.departmentId && departmentIds !== null) {
      if (!departmentIds.includes(query.departmentId)) {
        throw new ForbiddenException(
          'Department is outside your authorized scope.',
        );
      }
    }

    // Validate programId
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

    // Build filter
    const departmentFilter: FilterQuery<Department> = {
      semester: query.semesterId,
    };

    if (query.departmentId) {
      departmentFilter.id = query.departmentId;
    } else if (departmentIds !== null) {
      if (departmentIds.length === 0) {
        return this.BuildEmptyPage(page, limit);
      }
      departmentFilter.id = { $in: departmentIds };
    }

    const programFilter: FilterQuery<Program> = {
      department: departmentFilter,
    };

    if (query.programId) {
      programFilter.id = query.programId;
    }

    const filter: FilterQuery<Course> = {
      program: programFilter,
    };

    this.ApplySearchFilter(filter, query.search, ['shortname', 'fullname']);

    const [courses, totalItems] = await this.em.findAndCount(Course, filter, {
      populate: ['program'],
      orderBy: { shortname: QueryOrder.ASC },
      limit,
      offset,
    });

    return {
      data: courses.map((c) => CourseItemResponseDto.Map(c)),
      meta: {
        totalItems,
        itemCount: courses.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  private async ValidateSemester(semesterId: string): Promise<void> {
    const semester = await this.em.findOne(Semester, { id: semesterId });
    if (!semester) {
      throw new NotFoundException(
        `Semester with id '${semesterId}' not found.`,
      );
    }
  }

  private ApplySearchFilter(
    filter: Record<string, unknown>,
    search: string | undefined,
    fields: [string, string],
  ): void {
    if (!search) return;
    const escaped = this.EscapeLikeWildcards(search);
    Object.assign(filter, {
      $and: [
        {
          $or: fields.map((field) => ({
            [field]: { $ilike: `%${escaped}%` },
          })),
        },
      ],
    });
  }

  private EscapeLikeWildcards(input: string): string {
    return input
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
  }

  private BuildEmptyPage(page: number, limit: number) {
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
}
