import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SentimentDistributionDto {
  @ApiProperty()
  positive!: number;

  @ApiProperty()
  neutral!: number;

  @ApiProperty()
  negative!: number;
}

export class QualitativeThemeDto {
  @ApiProperty()
  themeId!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty({ type: SentimentDistributionDto })
  sentimentSplit!: SentimentDistributionDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Up to 3 representative, PII-scrubbed, length-capped quotes',
  })
  sampleQuotes?: string[];
}

export class QualitativeSummaryResponseDto {
  @ApiProperty({ type: SentimentDistributionDto })
  sentimentDistribution!: SentimentDistributionDto;

  @ApiProperty({ type: [QualitativeThemeDto] })
  themes!: QualitativeThemeDto[];
}
