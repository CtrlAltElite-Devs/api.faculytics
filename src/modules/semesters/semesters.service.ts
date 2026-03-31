import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Semester } from '../../entities/semester.entity';
import { SemesterShortResponseDto } from '../enrollments/dto/responses/semester-short.response.dto';

@Injectable()
export class SemestersService {
  constructor(private readonly em: EntityManager) {}

  async getCurrentSemester(): Promise<SemesterShortResponseDto> {
    const semester = await this.em.findOne(
      Semester,
      {},
      { orderBy: { createdAt: 'DESC' } },
    );

    if (!semester) {
      throw new NotFoundException('No active semester found');
    }

    return {
      id: semester.id,
      code: semester.code,
      label: semester.label,
      academicYear: semester.academicYear,
    };
  }
}
