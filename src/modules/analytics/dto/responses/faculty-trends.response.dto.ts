import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FacultyTrendDto {
  @ApiProperty()
  facultyId!: string;

  @ApiProperty()
  facultyName!: string;

  @ApiProperty()
  departmentCode!: string;

  @ApiProperty()
  semesterCount!: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  latestAvgScore!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  latestPositiveRate!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  scoreSlope!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  scoreR2!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  sentimentSlope!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  sentimentR2!: number | null;

  @ApiProperty({ enum: ['improving', 'declining', 'stable'] })
  trendDirection!: 'improving' | 'declining' | 'stable';
}

export class FacultyTrendsResponseDto {
  @ApiProperty({ type: [FacultyTrendDto] })
  items!: FacultyTrendDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  lastRefreshedAt!: string | null;
}
