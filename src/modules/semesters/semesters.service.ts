import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Semester } from '../../entities/semester.entity';
import { SemesterListResponseDto } from './dto/responses/semester-list.response.dto';

@Injectable()
export class SemestersService {
  constructor(private readonly em: EntityManager) {}

  async listSemesters(): Promise<SemesterListResponseDto> {
    const semesters = await this.em.find(
      Semester,
      {},
      {
        populate: ['campus'],
        orderBy: { createdAt: 'DESC' },
      },
    );

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
