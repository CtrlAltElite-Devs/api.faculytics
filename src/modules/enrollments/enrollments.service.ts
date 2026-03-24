import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Enrollment } from 'src/entities/enrollment.entity';
import { CacheService } from '../common/cache/cache.service';
import { CacheNamespace } from '../common/cache/cache-namespaces';
import { CurrentUserService } from '../common/cls/current-user.service';
import { FacultyShortResponseDto } from './dto/responses/faculty-short.response.dto';
import { MyEnrollmentsResponseDto } from './dto/responses/my-enrollments.response.dto';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly em: EntityManager,
    private readonly cacheService: CacheService,
    private readonly currentUserService: CurrentUserService,
  ) {}

  async getMyEnrollments(
    page: number,
    limit: number,
  ): Promise<MyEnrollmentsResponseDto> {
    const user = this.currentUserService.getOrFail();
    return this.cacheService.wrap(
      CacheNamespace.ENROLLMENTS_ME,
      `${user.id}:${page}:${limit}`,
      () => this.fetchMyEnrollments(user.id, page, limit),
      1800000,
    );
  }

  private async fetchMyEnrollments(
    userId: string,
    page: number,
    limit: number,
  ): Promise<MyEnrollmentsResponseDto> {
    const [enrollments, totalItems] = await this.em.findAndCount(
      Enrollment,
      { user: userId, isActive: true },
      {
        populate: ['course.program.department.semester', 'section'],
        limit,
        offset: (page - 1) * limit,
        orderBy: { timeModified: 'DESC' },
      },
    );

    const courseIds = [...new Set(enrollments.map((e) => e.course.id))];
    const facultyMap = await this.getFacultyByCourseIds(courseIds);

    return {
      data: enrollments.map((e) => {
        const semester = e.course.program?.department?.semester;
        return {
          id: e.id,
          role: e.role,
          course: {
            id: e.course.id,
            moodleCourseId: e.course.moodleCourseId,
            shortname: e.course.shortname,
            fullname: e.course.fullname,
            courseImage: e.course.courseImage ?? undefined,
          },
          faculty: facultyMap.get(e.course.id) ?? null,
          semester: semester
            ? {
                id: semester.id,
                code: semester.code,
                label: semester.label,
                academicYear: semester.academicYear,
              }
            : null,
          section: e.section
            ? { id: e.section.id, name: e.section.name }
            : null,
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

  private async getFacultyByCourseIds(
    courseIds: string[],
  ): Promise<Map<string, FacultyShortResponseDto>> {
    const map = new Map<string, FacultyShortResponseDto>();
    if (courseIds.length === 0) return map;

    const facultyEnrollments = await this.em.find(
      Enrollment,
      { course: { $in: courseIds }, role: 'editingteacher', isActive: true },
      { populate: ['user', 'course'] },
    );

    for (const enrollment of facultyEnrollments) {
      const courseId = enrollment.course.id;
      if (map.has(courseId)) continue;

      const user = enrollment.user;
      map.set(courseId, {
        id: user.id,
        fullName: user.fullName ?? `${user.firstName} ${user.lastName}`,
        employeeNumber: user.userName,
        profilePicture: user.userProfilePicture || undefined,
      });
    }

    return map;
  }
}
