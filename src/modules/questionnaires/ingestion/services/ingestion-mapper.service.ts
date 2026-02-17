import { Injectable } from '@nestjs/common';
import { IngestionMappingLoader } from 'src/modules/common/data-loaders/ingestion-mapping.loader';
import { RawSubmissionData } from '../dto/raw-submission-data.dto';

export interface MappedSubmission {
  versionId: string;
  respondentId: string;
  facultyId: string;
  semesterId: string;
  courseId?: string;
  answers: Record<string, number>;
  qualitativeComment?: string;
  externalId: string;
}

export interface MappingResult {
  success: boolean;
  data?: MappedSubmission;
  error?: string;
}

@Injectable()
export class IngestionMapperService {
  constructor(private readonly loader: IngestionMappingLoader) {}

  async map(
    data: RawSubmissionData,
    versionId: string,
  ): Promise<MappingResult> {
    const [respondent, faculty, course] = await Promise.all([
      this.loader.loadUser(data.moodleUserId),
      this.loader.loadUser(data.moodleFacultyId),
      this.loader.loadCourse(data.courseId),
    ]);

    if (!respondent) {
      return {
        success: false,
        error: `Respondent with Moodle ID ${data.moodleUserId} not found.`,
      };
    }
    if (!faculty) {
      return {
        success: false,
        error: `Faculty with Moodle ID ${data.moodleFacultyId} not found.`,
      };
    }
    if (!course) {
      return {
        success: false,
        error: `Course with Moodle ID ${data.courseId} not found.`,
      };
    }

    const semesterId = course.program?.department?.semester?.id;
    if (!semesterId) {
      return {
        success: false,
        error: `Semester context not found for Course ${course.shortname}.`,
      };
    }

    const answers: Record<string, number> = {};
    for (const ans of data.answers) {
      answers[ans.questionId] = ans.value;
    }

    return {
      success: true,
      data: {
        versionId,
        respondentId: respondent.id,
        facultyId: faculty.id,
        semesterId,
        courseId: course.id,
        answers,
        externalId: data.externalId,
      },
    };
  }
}
