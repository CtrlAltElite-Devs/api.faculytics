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

class CoverageSliceDto {
  @ApiProperty()
  submissionCount!: number;

  @ApiProperty()
  commentCount!: number;
}

export class VoiceBreakdownDto {
  @ApiProperty({ type: CoverageSliceDto })
  facultyFeedback!: CoverageSliceDto;

  @ApiProperty({ type: CoverageSliceDto })
  inClassroom!: CoverageSliceDto;

  @ApiProperty({ type: CoverageSliceDto })
  outOfClassroom!: CoverageSliceDto;

  @ApiProperty({ type: CoverageSliceDto })
  other!: CoverageSliceDto;
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

  @ApiPropertyOptional({
    type: VoiceBreakdownDto,
    nullable: true,
    description:
      'Per-questionnaire-type coverage slices. Optional for back-compat with pipelines cached before this field existed.',
  })
  voiceBreakdown?: VoiceBreakdownDto | null;
}

/**
 * Derives a human-readable scope label from the FK columns populated on the
 * pipeline. Tolerates both new-shape (faculty/department/campus only) and
 * legacy-shape (program/course) rows without frontend branching. Guaranteed
 * non-null: every failure mode returns a defensive "Legacy scope" string
 * rather than null/undefined/[object Object].
 */
export function deriveScopeLabel(pipeline: AnalysisPipeline): string {
  try {
    if (pipeline.faculty) {
      const name = pipeline.faculty.fullName ?? null;
      return name
        ? `Faculty: ${name}`
        : `Faculty: ${pipeline.faculty.id.slice(0, 8)}`;
    }
    if (pipeline.department) {
      const code = pipeline.department.code ?? null;
      return code
        ? `Department: ${code}`
        : `Department: ${pipeline.department.id.slice(0, 8)}`;
    }
    if (pipeline.campus) {
      const code = pipeline.campus.code ?? null;
      return code
        ? `Campus: ${code}`
        : `Campus: ${pipeline.campus.id.slice(0, 8)}`;
    }
    // Legacy rows
    if (pipeline.program) {
      const code = pipeline.program.code ?? null;
      return code ? `Program: ${code}` : `Legacy scope`;
    }
    if (pipeline.course) {
      const shortname = pipeline.course.shortname ?? null;
      return shortname ? `Course: ${shortname}` : `Legacy scope`;
    }
    return 'Legacy scope';
  } catch {
    return 'Legacy scope';
  }
}

export class PipelineSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PipelineStatus })
  status!: PipelineStatus;

  @ApiProperty({ description: 'Human-readable scope label (always populated)' })
  scopeLabel!: string;

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

  static Map(
    pipeline: AnalysisPipeline,
    extras?: { voiceBreakdown?: VoiceBreakdownDto | null },
  ): PipelineSummaryResponseDto {
    return {
      id: pipeline.id,
      status: pipeline.status,
      scopeLabel: deriveScopeLabel(pipeline),
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
        voiceBreakdown: extras?.voiceBreakdown ?? null,
      },
      warnings: pipeline.warnings ?? [],
      createdAt: pipeline.createdAt.toISOString(),
      updatedAt: pipeline.updatedAt.toISOString(),
      completedAt: pipeline.completedAt?.toISOString() ?? null,
    };
  }
}
