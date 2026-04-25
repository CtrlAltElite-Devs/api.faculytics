import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ReportFacultyDto,
  ReportSemesterDto,
} from './faculty-report.response.dto';
import { COMPOSITE_COVERAGE_STATUSES } from '../../lib/composite-rating.constants';
import type { CompositeCoverageStatus } from '../../lib/composite-rating.constants';

export class FacultyOverviewCompositeDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      '2-decimal weighted rating. Null when coverageStatus ∈ {PARTIAL_NO_FEEDBACK, INSUFFICIENT, NO_DATA}.',
  })
  rating!: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Human-readable interpretation label (from INTERPRETATION_SCALE). Null iff rating is null.',
  })
  interpretation!: string | null;

  @ApiProperty({
    enum: COMPOSITE_COVERAGE_STATUSES,
    description:
      'Coverage-status key based on which per-type ratings are non-null. PARTIAL_NO_FEEDBACK (IN+OUT only, FEEDBACK missing) intentionally yields a null composite to respect the Dean-specified 50% FEEDBACK weighting.',
  })
  coverageStatus!: CompositeCoverageStatus;

  @ApiProperty({
    type: Number,
    description:
      'Sum of canonical weights for present types (0.00 – 1.00). 1.00 iff all three types have rating !== null.',
  })
  coverageWeight!: number;
}

export class FacultyOverviewContributionDto {
  @ApiProperty()
  questionnaireTypeCode!: string;

  @ApiProperty()
  questionnaireTypeName!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Per-type overall rating (same number returned by /report for this type). Null when the type has no scored data.',
  })
  rating!: number | null;

  @ApiProperty({
    type: Number,
    description: 'Canonical weight: 0.50 for FEEDBACK, 0.25 for IN and OUT.',
  })
  weight!: number;

  @ApiProperty({
    type: Number,
    description:
      'Post-renormalization weight (= weight / coverageWeight) for non-null composites; 0 when composite is null.',
  })
  effectiveWeight!: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'round2(rating × effectiveWeight). Null when rating is null OR composite is null. Chain-of-rounding invariant: composite.rating === round2(Σ non-null contribution[i]).',
  })
  contribution!: number | null;

  @ApiProperty({ type: Number })
  submissionCount!: number;
}

export class FacultyOverviewResponseDto {
  @ApiProperty({ type: ReportFacultyDto })
  faculty!: ReportFacultyDto;

  @ApiProperty({ type: ReportSemesterDto })
  semester!: ReportSemesterDto;

  @ApiProperty({ type: FacultyOverviewCompositeDto })
  composite!: FacultyOverviewCompositeDto;

  @ApiProperty({
    type: [FacultyOverviewContributionDto],
    description:
      'Always length 3, in canonical order: FACULTY_FEEDBACK, FACULTY_OUT_OF_CLASSROOM, FACULTY_IN_CLASSROOM.',
  })
  contributions!: FacultyOverviewContributionDto[];
}
