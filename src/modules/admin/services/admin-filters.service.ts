import { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Campus } from 'src/entities/campus.entity';
import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { Semester } from 'src/entities/semester.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { FilterOptionResponseDto } from '../dto/responses/filter-option.response.dto';
import { ProgramFilterOptionResponseDto } from '../dto/responses/program-filter-option.response.dto';
import { SemesterFilterResponseDto } from '../dto/responses/semester-filter.response.dto';

@Injectable()
export class AdminFiltersService {
  private readonly logger = new Logger(AdminFiltersService.name);

  constructor(private readonly em: EntityManager) {}

  async GetCampuses(): Promise<FilterOptionResponseDto[]> {
    const campuses = await this.em.find(
      Campus,
      {},
      { orderBy: { code: 'ASC' } },
    );
    return campuses.map((c) => FilterOptionResponseDto.Map(c));
  }

  async GetSemesters(): Promise<SemesterFilterResponseDto[]> {
    const semesters = await this.em.find(
      Semester,
      {},
      { populate: ['campus'], orderBy: { code: 'DESC' } },
    );

    const results: SemesterFilterResponseDto[] = [];

    for (const sem of semesters) {
      const match = sem.code.match(/^S([12])(\d{2})(\d{2})$/);
      if (!match) {
        this.logger.warn(
          `Skipping semester with malformed code: "${sem.code}" (id=${sem.id})`,
        );
        continue;
      }

      const semesterNum = match[1];
      const fullStartYear = '20' + match[2];
      const fullEndYear = '20' + match[3];

      let startDate: string;
      let endDate: string;
      if (semesterNum === '1') {
        startDate = `${fullStartYear}-08-01`;
        endDate = `${fullStartYear}-12-18`;
      } else {
        startDate = `${fullEndYear}-01-20`;
        endDate = `${fullEndYear}-06-01`;
      }

      results.push({
        id: sem.id,
        code: sem.code,
        label: sem.label ?? `Semester ${semesterNum}`,
        academicYear: sem.academicYear ?? `${fullStartYear}-${fullEndYear}`,
        campusCode: sem.campus.code,
        startDate,
        endDate,
      });
    }

    return results;
  }

  async GetDepartments(
    campusId?: string,
    semesterId?: string,
  ): Promise<FilterOptionResponseDto[]> {
    const filter: FilterQuery<Department> = {};
    if (semesterId) {
      filter.semester = semesterId;
    } else if (campusId) {
      filter.semester = { campus: campusId };
    }
    const departments = await this.em.find(Department, filter, {
      orderBy: { code: 'ASC' },
    });
    return departments.map((d) => FilterOptionResponseDto.Map(d));
  }

  async GetPrograms(
    departmentId?: string,
  ): Promise<ProgramFilterOptionResponseDto[]> {
    const filter: FilterQuery<Program> = {};
    if (departmentId) {
      filter.department = departmentId;
    }
    const programs = await this.em.find(Program, filter, {
      orderBy: { code: 'ASC' },
    });
    return programs.map((p) => ProgramFilterOptionResponseDto.MapProgram(p));
  }

  GetRoles(): UserRole[] {
    return Object.values(UserRole);
  }
}
