import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import { PipelineStatus } from '../../enums';

class PipelineSummaryScopeDto {
  @ApiProperty()
  semesterId!: string;

  @ApiProperty()
  semesterCode!: string;

  @ApiPropertyOptional({ nullable: true })
  departmentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  departmentCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  facultyId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  facultyName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  programId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  programCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  campusId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  campusCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  courseId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  courseShortname!: string | null;

  @ApiPropertyOptional({ nullable: true })
  questionnaireVersionId!: string | null;
}

class PipelineSummaryCoverageDto {
  @ApiProperty()
  totalEnrolled!: number;

  @ApiProperty()
  submissionCount!: number;

  @ApiProperty()
  commentCount!: number;

  @ApiProperty()
  responseRate!: number;

  @ApiPropertyOptional({ nullable: true })
  lastEnrollmentSyncAt!: string | null;
}

export class PipelineSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PipelineStatus })
  status!: PipelineStatus;

  @ApiProperty({ type: PipelineSummaryScopeDto })
  scope!: PipelineSummaryScopeDto;

  @ApiProperty({ type: PipelineSummaryCoverageDto })
  coverage!: PipelineSummaryCoverageDto;

  @ApiProperty({ type: [String] })
  warnings!: string[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: string | null;

  static Map(pipeline: AnalysisPipeline): PipelineSummaryResponseDto {
    return {
      id: pipeline.id,
      status: pipeline.status,
      scope: {
        semesterId: pipeline.semester?.id ?? '',
        semesterCode: pipeline.semester?.code ?? '',
        departmentId: pipeline.department?.id ?? null,
        departmentCode: pipeline.department?.code ?? null,
        facultyId: pipeline.faculty?.id ?? null,
        facultyName: pipeline.faculty?.fullName ?? null,
        programId: pipeline.program?.id ?? null,
        programCode: pipeline.program?.code ?? null,
        campusId: pipeline.campus?.id ?? null,
        campusCode: pipeline.campus?.code ?? null,
        courseId: pipeline.course?.id ?? null,
        courseShortname: pipeline.course?.shortname ?? null,
        questionnaireVersionId: pipeline.questionnaireVersion?.id ?? null,
      },
      coverage: {
        totalEnrolled: pipeline.totalEnrolled,
        submissionCount: pipeline.submissionCount,
        commentCount: pipeline.commentCount,
        responseRate: Number(pipeline.responseRate),
        lastEnrollmentSyncAt: null,
      },
      warnings: pipeline.warnings ?? [],
      createdAt: pipeline.createdAt.toISOString(),
      updatedAt: pipeline.updatedAt.toISOString(),
      completedAt: pipeline.completedAt?.toISOString() ?? null,
    };
  }
}
