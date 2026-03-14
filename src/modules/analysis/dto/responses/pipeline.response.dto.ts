import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import { PipelineStatus } from '../../enums';

export class PipelineResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: PipelineStatus })
  status: PipelineStatus;

  @ApiProperty()
  semesterId: string;

  @ApiPropertyOptional({ nullable: true })
  facultyId: string | null;

  @ApiPropertyOptional({ nullable: true })
  questionnaireVersionId: string | null;

  @ApiPropertyOptional({ nullable: true })
  departmentId: string | null;

  @ApiPropertyOptional({ nullable: true })
  programId: string | null;

  @ApiPropertyOptional({ nullable: true })
  campusId: string | null;

  @ApiPropertyOptional({ nullable: true })
  courseId: string | null;

  @ApiProperty()
  triggeredById: string;

  @ApiProperty()
  totalEnrolled: number;

  @ApiProperty()
  submissionCount: number;

  @ApiProperty()
  commentCount: number;

  @ApiProperty()
  responseRate: number;

  @ApiProperty({ type: [String] })
  warnings: string[];

  @ApiPropertyOptional({ nullable: true })
  errorMessage: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional({ nullable: true })
  confirmedAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  completedAt: string | null;

  static Map(pipeline: AnalysisPipeline): PipelineResponseDto {
    return {
      id: pipeline.id,
      status: pipeline.status,
      semesterId: pipeline.semester.id,
      facultyId: pipeline.faculty?.id ?? null,
      questionnaireVersionId: pipeline.questionnaireVersion?.id ?? null,
      departmentId: pipeline.department?.id ?? null,
      programId: pipeline.program?.id ?? null,
      campusId: pipeline.campus?.id ?? null,
      courseId: pipeline.course?.id ?? null,
      triggeredById: pipeline.triggeredBy.id,
      totalEnrolled: pipeline.totalEnrolled,
      submissionCount: pipeline.submissionCount,
      commentCount: pipeline.commentCount,
      responseRate: Number(pipeline.responseRate),
      warnings: pipeline.warnings,
      errorMessage: pipeline.errorMessage ?? null,
      createdAt: pipeline.createdAt.toISOString(),
      confirmedAt: pipeline.confirmedAt?.toISOString() ?? null,
      completedAt: pipeline.completedAt?.toISOString() ?? null,
    };
  }
}
