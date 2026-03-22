import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FacultySemesterStatsDto {
  @ApiProperty()
  facultyId!: string;

  @ApiProperty()
  facultyName!: string;

  @ApiProperty()
  departmentCode!: string;

  @ApiProperty()
  submissionCount!: number;

  @ApiProperty()
  commentCount!: number;

  @ApiProperty()
  avgNormalizedScore!: number;

  @ApiProperty()
  positiveCount!: number;

  @ApiProperty()
  negativeCount!: number;

  @ApiProperty()
  neutralCount!: number;

  @ApiProperty()
  analyzedCount!: number;

  @ApiProperty()
  topicCount!: number;

  @ApiProperty()
  percentileRank!: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  scoreDelta!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  sentimentDelta!: number | null;
}

export class DepartmentSummaryDto {
  @ApiProperty()
  totalFaculty!: number;

  @ApiProperty()
  totalSubmissions!: number;

  @ApiProperty()
  totalAnalyzed!: number;

  @ApiProperty()
  positiveCount!: number;

  @ApiProperty()
  negativeCount!: number;

  @ApiProperty()
  neutralCount!: number;
}

export class DepartmentOverviewResponseDto {
  @ApiProperty({ type: DepartmentSummaryDto })
  summary!: DepartmentSummaryDto;

  @ApiProperty({ type: [FacultySemesterStatsDto] })
  faculty!: FacultySemesterStatsDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  lastRefreshedAt!: string | null;
}
