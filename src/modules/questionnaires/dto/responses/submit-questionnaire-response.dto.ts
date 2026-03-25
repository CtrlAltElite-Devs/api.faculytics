import { ApiProperty } from '@nestjs/swagger';
import { RespondentRole } from '../../lib/questionnaire.types';
import type { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';

export class SubmitQuestionnaireResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  submittedAt: Date;

  @ApiProperty({ enum: RespondentRole })
  respondentRole: RespondentRole;

  @ApiProperty({ type: 'number' })
  totalScore: number;

  @ApiProperty({ type: 'number' })
  normalizedScore: number;

  @ApiProperty()
  faculty: string;

  @ApiProperty({ required: false, nullable: true })
  course?: string;

  @ApiProperty()
  semester: string;

  @ApiProperty()
  academicYear: string;

  static Map(submission: QuestionnaireSubmission): SubmitQuestionnaireResponse {
    return {
      id: submission.id,
      submittedAt: submission.submittedAt,
      respondentRole: submission.respondentRole,
      totalScore: submission.totalScore,
      normalizedScore: submission.normalizedScore,
      faculty: submission.facultyNameSnapshot,
      course: submission.courseTitleSnapshot,
      semester: submission.semesterLabelSnapshot,
      academicYear: submission.academicYearSnapshot,
    };
  }
}
