import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';

export class ReportCommentDto {
  @ApiProperty()
  text!: string;

  @ApiProperty()
  submittedAt!: string;
}

export class FacultyReportCommentsResponseDto {
  @ApiProperty({ type: [ReportCommentDto] })
  items!: ReportCommentDto[];

  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}
