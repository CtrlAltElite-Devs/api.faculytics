import { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Campus } from 'src/entities/campus.entity';
import { Department } from 'src/entities/department.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Program } from 'src/entities/program.entity';
import { QuestionnaireType } from 'src/entities/questionnaire-type.entity';
import { QuestionnaireVersion } from 'src/entities/questionnaire-version.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { EnrollmentRole } from 'src/modules/questionnaires/lib/questionnaire.types';
import { FilterOptionResponseDto } from '../dto/responses/filter-option.response.dto';
import { FilterFacultyResponseDto } from '../dto/responses/filter-faculty.response.dto';
import { FilterCourseResponseDto } from '../dto/responses/filter-course.response.dto';
import { FilterVersionResponseDto } from '../dto/responses/filter-version.response.dto';

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

  async GetFaculty(): Promise<FilterFacultyResponseDto[]> {
    const enrollments = await this.em.find(
      Enrollment,
      { role: EnrollmentRole.EDITING_TEACHER, isActive: true },
      { populate: ['user'] },
    );

    // Deduplicate by user ID
    const userMap = new Map<string, User>();
    for (const e of enrollments) {
      if (!userMap.has(e.user.id)) {
        userMap.set(e.user.id, e.user);
      }
    }

    return Array.from(userMap.values())
      .sort((a, b) => {
        const nameA = a.fullName ?? `${a.firstName} ${a.lastName}`;
        const nameB = b.fullName ?? `${b.firstName} ${b.lastName}`;
        return nameA.localeCompare(nameB);
      })
      .map((u) => FilterFacultyResponseDto.Map(u));
  }

  async GetCoursesForFaculty(
    facultyUsername: string,
  ): Promise<FilterCourseResponseDto[]> {
    const user = await this.em.findOne(User, { userName: facultyUsername });
    if (!user) {
      throw new NotFoundException(
        `User with username "${facultyUsername}" not found.`,
      );
    }

    const enrollments = await this.em.find(
      Enrollment,
      { user, role: EnrollmentRole.EDITING_TEACHER, isActive: true },
      { populate: ['course'] },
    );

    return enrollments.map((e) => FilterCourseResponseDto.Map(e.course));
  }

  async GetQuestionnaireTypes(): Promise<FilterOptionResponseDto[]> {
    const types = await this.em.find(
      QuestionnaireType,
      {},
      { orderBy: { code: 'ASC' } },
    );
    return types.map((t) => FilterOptionResponseDto.Map(t));
  }

  async GetQuestionnaireVersions(
    typeId: string,
  ): Promise<FilterVersionResponseDto[]> {
    const type = await this.em.findOne(QuestionnaireType, typeId);
    if (!type) {
      throw new NotFoundException(
        `Questionnaire type with ID "${typeId}" not found.`,
      );
    }

    const versions = await this.em.find(QuestionnaireVersion, {
      questionnaire: { type: typeId },
      isActive: true,
    });

    return versions.map((v) => FilterVersionResponseDto.Map(v));
  }
}
