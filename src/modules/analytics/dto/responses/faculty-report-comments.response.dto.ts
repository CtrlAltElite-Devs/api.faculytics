import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { SENTIMENT_LABELS } from '../analytics-query.dto';
import type { SentimentLabel } from '../analytics-query.dto';

export class ReportCommentDto {
  @ApiProperty()
  text!: string;

  @ApiProperty()
  submittedAt!: string;

  @ApiPropertyOptional({ enum: SENTIMENT_LABELS })
  sentiment?: SentimentLabel;

  @ApiPropertyOptional({
    type: [String],
    description: 'Dominant topic ids (themeIds) for this submission',
  })
  themeIds?: string[];
}

export class FacultyReportCommentsResponseDto {
  @ApiProperty({ type: [ReportCommentDto] })
  items!: ReportCommentDto[];

  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}
