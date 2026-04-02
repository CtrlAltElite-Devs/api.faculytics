import { Injectable } from '@nestjs/common';
import { EntityManager, FilterQuery } from '@mikro-orm/core';
import { Semester } from '../../entities/semester.entity';
import { SemesterListResponseDto } from './dto/responses/semester-list.response.dto';
import { ListSemestersQueryDto } from './dto/requests/list-semesters-query.dto';

@Injectable()
export class SemestersService {
  constructor(private readonly em: EntityManager) {}

  async listSemesters(
    query: ListSemestersQueryDto,
  ): Promise<SemesterListResponseDto> {
    const filter: FilterQuery<Semester> = {};
    if (query.campusId) {
      filter.campus = query.campusId;
    }

    const semesters = await this.em.find(Semester, filter, {
      populate: ['campus'],
      orderBy: { createdAt: 'DESC' },
    });

    return {
      data: semesters.map((s) => ({
        id: s.id,
        code: s.code,
        label: s.label,
        academicYear: s.academicYear,
        campus: {
          id: s.campus.id,
          code: s.campus.code,
          name: s.campus.name,
        },
      })),
    };
  }
}
