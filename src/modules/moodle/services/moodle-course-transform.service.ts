import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { faker } from '@faker-js/faker';
import {
  CurriculumRow,
  CoursePreviewRow,
  SeedContext,
  SeedUserRecord,
} from '../lib/provisioning.types';

@Injectable()
export class MoodleCourseTransformService {
  GenerateShortname(
    campus: string,
    semester: string,
    startYY: string,
    endYY: string,
    courseCode: string,
  ): string {
    const code = courseCode.replace(/\s+/g, '');
    const edp = String(randomInt(0, 100000)).padStart(5, '0');
    return `${campus.toUpperCase()}-S${semester}${startYY}${endYY}-${code}-${edp}`;
  }

  BuildCategoryPath(
    campus: string,
    semester: string,
    dept: string,
    program: string,
    startYY: string,
    endYY: string,
  ): string {
    return `${campus.toUpperCase()} / S${semester}${startYY}${endYY} / ${dept.toUpperCase()} / ${program.toUpperCase()}`;
  }

  GetSemesterDates(
    semester: string,
    startYear: string,
    endYear: string,
  ): { startDate: string; endDate: string } | null {
    if (semester === '1') {
      return {
        startDate: `${startYear}-08-01`,
        endDate: `${startYear}-12-18`,
      };
    }
    if (semester === '2') {
      return {
        startDate: `${endYear}-01-20`,
        endDate: `${endYear}-06-01`,
      };
    }
    return null;
  }

  BuildSemesterTag(semester: string, startYY: string, endYY: string): string {
    return `S${semester}${startYY}${endYY}`;
  }

  ComputePreview(row: CurriculumRow, context: SeedContext): CoursePreviewRow {
    const dates = this.GetSemesterDates(
      row.semester,
      context.startYear,
      context.endYear,
    );
    return {
      shortname: this.GenerateShortname(
        context.campus,
        row.semester,
        context.startYY,
        context.endYY,
        row.courseCode,
      ),
      fullname: row.descriptiveTitle,
      categoryPath: this.BuildCategoryPath(
        context.campus,
        row.semester,
        context.department,
        row.program,
        context.startYY,
        context.endYY,
      ),
      categoryId: 0,
      startDate: dates?.startDate ?? '',
      endDate: dates?.endDate ?? '',
      program: row.program,
      semester: row.semester,
      courseCode: row.courseCode,
    };
  }

  GenerateStudentUsername(campus: string): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = String(randomInt(0, 10000)).padStart(4, '0');
    return `${campus.toLowerCase()}-${yy}${mm}${dd}${rand}`;
  }

  GenerateFacultyUsername(campus: string): string {
    const rand = String(randomInt(0, 100000)).padStart(5, '0');
    return `${campus.toLowerCase()}-t-${rand}`;
  }

  GenerateFakeUser(
    campus: string,
    role: 'student' | 'faculty',
  ): SeedUserRecord {
    const username =
      role === 'student'
        ? this.GenerateStudentUsername(campus)
        : this.GenerateFacultyUsername(campus);
    const firstname = faker.person.firstName();
    const lastname = faker.person.lastName();
    return {
      username,
      firstname,
      lastname,
      email: `${username}@faculytics.seed`,
      password: 'User123#',
    };
  }
}
