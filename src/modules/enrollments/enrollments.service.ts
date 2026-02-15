import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Enrollment } from 'src/entities/enrollment.entity';
import { User } from 'src/entities/user.entity';
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

    return {
      data: enrollments.map((e) => ({
        id: e.id,
        role: e.role,
        course: {
          id: e.course.id,
          moodleCourseId: e.course.moodleCourseId,
          shortname: e.course.shortname,
          fullname: e.course.fullname,
        },
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
}
