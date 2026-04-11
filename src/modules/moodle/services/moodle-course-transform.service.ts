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

  ComputeSchoolYears(
    semester: number,
    startDate: string,
    endDate: string,
  ): { startYY: string; endYY: string } {
    const startYear = parseInt(startDate.slice(0, 4), 10);
    const endYear = parseInt(endDate.slice(0, 4), 10);

    if (isNaN(startYear) || isNaN(endYear)) {
      throw new Error(
        `Invalid date format: startDate="${startDate}", endDate="${endDate}". Expected YYYY-MM-DD.`,
      );
    }

    // If dates span different years, the school year boundary is explicit
    if (startYear !== endYear) {
      return {
        startYY: String(startYear).slice(-2),
        endYY: String(endYear).slice(-2),
      };
    }

    // Same year — derive school year from semester number
    if (semester === 1) {
      // Semester 1 starts in Aug — year is school start year
      return {
        startYY: String(startYear).slice(-2),
        endYY: String(startYear + 1).slice(-2),
      };
    }
    if (semester === 2) {
      // Semester 2 starts in Jan — year is school end year
      return {
        startYY: String(startYear - 1).slice(-2),
        endYY: String(startYear).slice(-2),
      };
    }
    throw new Error(`Invalid semester: ${semester}. Must be 1 or 2.`);
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
