import type { SentimentLabel } from 'src/modules/analytics/dto/analytics-query.dto';

export interface PdfCommentDto {
  text: string;
  sentiment?: SentimentLabel;
  themeLabels: string[];
}
