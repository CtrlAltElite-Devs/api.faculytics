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
import { ProgramItemResponseDto } from '../dto/responses/program-item.response.dto';
import { CourseItemResponseDto } from '../dto/responses/course-item.response.dto';

@Injectable()
export class CurriculumService {
  constructor(
    private readonly em: EntityManager,
    private readonly scopeResolverService: ScopeResolverService,
  ) {}

  async ListDepartments(
    query: ListDepartmentsQueryDto,
  ): Promise<DepartmentItemResponseDto[]> {
    await this.ValidateSemester(query.semesterId);

    const departmentIds = await this.scopeResolverService.ResolveDepartmentIds(
      query.semesterId,
    );

    const filter: FilterQuery<Department> = {
      semester: query.semesterId,
    };

    if (departmentIds !== null) {
      if (departmentIds.length === 0) {
        return [];
      }
      Object.assign(filter, { id: { $in: departmentIds } });
    }

    if (query.search) {
      const escaped = this.EscapeLikeWildcards(query.search);
      Object.assign(filter, {
        $and: [
          {
            $or: [
              { code: { $ilike: `%${escaped}%` } },
              { name: { $ilike: `%${escaped}%` } },
            ],
          },
        ],
      });
    }

    const departments = await this.em.find(Department, filter, {
      orderBy: { name: QueryOrder.ASC_NULLS_LAST },
    });

    return departments.map((d) => DepartmentItemResponseDto.Map(d));
  }

  async ListPrograms(
    query: ListProgramsQueryDto,
  ): Promise<ProgramItemResponseDto[]> {
    await this.ValidateSemester(query.semesterId);

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

    const departmentFilter: Record<string, unknown> = {
      semester: query.semesterId,
    };

    if (query.departmentId) {
      departmentFilter.id = query.departmentId;
    } else if (departmentIds !== null) {
      if (departmentIds.length === 0) {
        return [];
      }
      departmentFilter.id = { $in: departmentIds };
    }

    const filter: FilterQuery<Program> = {
      department: departmentFilter,
    } as FilterQuery<Program>;

    if (query.search) {
      const escaped = this.EscapeLikeWildcards(query.search);
      Object.assign(filter, {
        $and: [
          {
            $or: [
              { code: { $ilike: `%${escaped}%` } },
              { name: { $ilike: `%${escaped}%` } },
            ],
          },
        ],
      });
    }

    const programs = await this.em.find(Program, filter, {
      populate: ['department'],
      orderBy: { name: QueryOrder.ASC_NULLS_LAST },
    });

    return programs.map((p) => ProgramItemResponseDto.Map(p));
  }

  async ListCourses(
    query: ListCoursesQueryDto,
  ): Promise<CourseItemResponseDto[]> {
    await this.ValidateSemester(query.semesterId);

    if (!query.programId && !query.departmentId) {
      throw new BadRequestException(
        'At least one of programId or departmentId is required.',
      );
    }

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
    const departmentFilter: Record<string, unknown> = {
      semester: query.semesterId,
    };

    if (query.departmentId) {
      departmentFilter.id = query.departmentId;
    } else if (departmentIds !== null) {
      if (departmentIds.length === 0) {
        return [];
      }
      departmentFilter.id = { $in: departmentIds };
    }

    const programFilter: Record<string, unknown> = {
      department: departmentFilter,
    };

    if (query.programId) {
      programFilter.id = query.programId;
    }

    const filter: FilterQuery<Course> = {
      program: programFilter,
    } as FilterQuery<Course>;

    if (query.search) {
      const escaped = this.EscapeLikeWildcards(query.search);
      Object.assign(filter, {
        $and: [
          {
            $or: [
              { shortname: { $ilike: `%${escaped}%` } },
              { fullname: { $ilike: `%${escaped}%` } },
            ],
          },
        ],
      });
    }

    const courses = await this.em.find(Course, filter, {
      populate: ['program'],
      orderBy: { shortname: QueryOrder.ASC },
    });

    return courses.map((c) => CourseItemResponseDto.Map(c));
  }

  private async ValidateSemester(semesterId: string): Promise<void> {
    const semester = await this.em.findOne(Semester, { id: semesterId });
    if (!semester) {
      throw new NotFoundException(
        `Semester with id '${semesterId}' not found.`,
      );
    }
  }

  private EscapeLikeWildcards(input: string): string {
    return input
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
  }
}
