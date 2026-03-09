import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Enrollment } from 'src/entities/enrollment.entity';
import { User } from 'src/entities/user.entity';
import { FacultyShortResponseDto } from './dto/responses/faculty-short.response.dto';
import { MyEnrollmentsResponseDto } from './dto/responses/my-enrollments.response.dto';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly em: EntityManager) {}

  async getMyEnrollments(
    user: User,
    page: number,
    limit: number,
  ): Promise<MyEnrollmentsResponseDto> {
    const [enrollments, totalItems] = await this.em.findAndCount(
      Enrollment,
      { user: user.id, isActive: true },
      {
        populate: ['course'],
        limit,
        offset: (page - 1) * limit,
        orderBy: { timeModified: 'DESC' },
      },
    );

    const courseIds = [...new Set(enrollments.map((e) => e.course.id))];
    const facultyMap = await this.getFacultyByCourseIds(courseIds);

    return {
      data: enrollments.map((e) => ({
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
      })),
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
