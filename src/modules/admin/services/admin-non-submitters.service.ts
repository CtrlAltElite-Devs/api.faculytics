import { FilterQuery } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Enrollment } from 'src/entities/enrollment.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { Semester } from 'src/entities/semester.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import {
  EnrollmentRole,
  RespondentRole,
} from 'src/modules/questionnaires/lib/questionnaire.types';
import { ListNonSubmittersQueryDto } from '../dto/requests/list-non-submitters-query.dto';
import { AdminNonSubmitterItemResponseDto } from '../dto/responses/admin-non-submitter-item.response.dto';
import { AdminNonSubmitterListResponseDto } from '../dto/responses/admin-non-submitter-list.response.dto';

@Injectable()
export class AdminNonSubmittersService {
  private readonly logger = new Logger(AdminNonSubmittersService.name);

  constructor(private readonly em: EntityManager) {}

  async ListNonSubmitters(
    query: ListNonSubmittersQueryDto,
  ): Promise<AdminNonSubmitterListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const semester = await this.ResolveScopeSemester(query.semesterId);
    if (!semester) {
      return this.EmptyResponse(page, limit, null);
    }

    const facultyId = await this.ResolveFacultyId(query.facultyUsername);

    const enrolledCountByUser = await this.BuildEnrolledStudentPool(
      semester.id,
      query.courseId,
    );
    if (enrolledCountByUser.size === 0) {
      return this.EmptyResponse(page, limit, semester);
    }

    const submitterIds = await this.BuildSubmitterSet(
      semester.id,
      facultyId,
      query.courseId,
    );

    const candidateIds: string[] = [];
    for (const userId of enrolledCountByUser.keys()) {
      if (!submitterIds.has(userId)) {
        candidateIds.push(userId);
      }
    }
    if (candidateIds.length === 0) {
      return this.EmptyResponse(page, limit, semester);
    }

    const filter = this.BuildUserFilter(candidateIds, query.search);
    const offset = (page - 1) * limit;

    const [users, totalItems] = await this.em.findAndCount(User, filter, {
      populate: ['campus', 'department', 'program'],
      limit,
      offset,
      orderBy: { userName: 'ASC', id: 'ASC' },
    });

    return {
      data: users.map((user) =>
        AdminNonSubmitterItemResponseDto.Map(
          user,
          enrolledCountByUser.get(user.id) ?? 0,
        ),
      ),
      meta: {
        totalItems,
        itemCount: users.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
      scope: {
        semesterId: semester.id,
        semesterCode: semester.code,
        semesterLabel: semester.label,
        academicYear: semester.academicYear,
      },
    };
  }

  private async ResolveScopeSemester(
    semesterId: string | undefined,
  ): Promise<Semester | null> {
    if (semesterId) {
      const semester = await this.em.findOne(Semester, { id: semesterId });
      if (!semester) {
        throw new BadRequestException(
          `Semester with id "${semesterId}" not found.`,
        );
      }
      return semester;
    }
    return this.em.findOne(Semester, {}, { orderBy: { createdAt: 'DESC' } });
  }

  private async ResolveFacultyId(
    facultyUsername: string | undefined,
  ): Promise<string | null> {
    if (!facultyUsername) return null;
    const faculty = await this.em.findOne(
      User,
      { userName: facultyUsername },
      { fields: ['id'] },
    );
    if (!faculty) {
      throw new NotFoundException(
        `Faculty with username "${facultyUsername}" not found.`,
      );
    }
    return faculty.id;
  }

  private async BuildEnrolledStudentPool(
    semesterId: string,
    courseId: string | undefined,
  ): Promise<Map<string, number>> {
    const filter: FilterQuery<Enrollment> = {
      role: EnrollmentRole.STUDENT,
      isActive: true,
      course: courseId
        ? { id: courseId, program: { department: { semester: semesterId } } }
        : { program: { department: { semester: semesterId } } },
    };

    const enrollments = await this.em.find(Enrollment, filter, {
      fields: ['user', 'course'],
    });

    const coursesByUser = new Map<string, Set<string>>();
    for (const enrollment of enrollments) {
      const userId = enrollment.user.id;
      const courseSet = coursesByUser.get(userId) ?? new Set<string>();
      courseSet.add(enrollment.course.id);
      coursesByUser.set(userId, courseSet);
    }

    const counts = new Map<string, number>();
    for (const [userId, courseSet] of coursesByUser) {
      counts.set(userId, courseSet.size);
    }
    return counts;
  }

  private async BuildSubmitterSet(
    semesterId: string,
    facultyId: string | null,
    courseId: string | undefined,
  ): Promise<Set<string>> {
    const filter: FilterQuery<QuestionnaireSubmission> = {
      semester: semesterId,
      respondentRole: RespondentRole.STUDENT,
    };
    if (facultyId) filter.faculty = facultyId;
    if (courseId) filter.course = courseId;

    const submissions = await this.em.find(QuestionnaireSubmission, filter, {
      fields: ['respondent'],
    });

    return new Set(submissions.map((s) => s.respondent.id));
  }

  private BuildUserFilter(
    candidateIds: string[],
    search: string | undefined,
  ): FilterQuery<User> {
    const filter: FilterQuery<User> = {
      id: { $in: candidateIds },
      roles: { $contains: [UserRole.STUDENT] },
    };

    if (search) {
      const pattern = `%${this.EscapeLikePattern(search.trim())}%`;
      filter.$or = [
        { userName: { $ilike: pattern } },
        { fullName: { $ilike: pattern } },
        { firstName: { $ilike: pattern } },
        { lastName: { $ilike: pattern } },
      ];
    }

    return filter;
  }

  private EscapeLikePattern(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }

  private EmptyResponse(
    page: number,
    limit: number,
    semester: Semester | null,
  ): AdminNonSubmitterListResponseDto {
    return {
      data: [],
      meta: {
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: limit,
        totalPages: 0,
        currentPage: page,
      },
      scope: {
        semesterId: semester?.id ?? '',
        semesterCode: semester?.code ?? '',
        semesterLabel: semester?.label,
        academicYear: semester?.academicYear,
      },
    };
  }
}
