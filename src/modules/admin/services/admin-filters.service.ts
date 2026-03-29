import { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Campus } from 'src/entities/campus.entity';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { FilterOptionResponseDto } from '../dto/responses/filter-option.response.dto';

@Injectable()
export class AdminFiltersService {
  constructor(private readonly em: EntityManager) {}

  async GetCampuses(): Promise<FilterOptionResponseDto[]> {
    const campuses = await this.em.find(
      Campus,
      {},
      { orderBy: { code: 'ASC' } },
    );
    return campuses.map((c) => FilterOptionResponseDto.Map(c));
  }

  async GetDepartments(campusId?: string): Promise<FilterOptionResponseDto[]> {
    const filter: FilterQuery<Department> = {};
    if (campusId) {
      filter.semester = { campus: campusId };
    }
    const departments = await this.em.find(Department, filter, {
      orderBy: { code: 'ASC' },
    });
    return departments.map((d) => FilterOptionResponseDto.Map(d));
  }

  async GetPrograms(departmentId?: string): Promise<FilterOptionResponseDto[]> {
    const filter: FilterQuery<Program> = {};
    if (departmentId) {
      filter.department = departmentId;
    }
    const programs = await this.em.find(Program, filter, {
      orderBy: { code: 'ASC' },
    });
    return programs.map((p) => FilterOptionResponseDto.Map(p));
  }

  GetRoles(): UserRole[] {
    return Object.values(UserRole);
  }
}
