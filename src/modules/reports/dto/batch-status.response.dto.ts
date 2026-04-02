import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { ReportStatusResponseDto } from './report-status.response.dto';

export class BatchStatusResponseDto {
  @ApiProperty()
  batchId: string;

  @ApiProperty()
  total: number;

  @ApiProperty()
  completed: number;

  @ApiProperty()
  failed: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty()
  active: number;

  @ApiProperty()
  waiting: number;

  @ApiProperty({ type: [ReportStatusResponseDto] })
  jobs: ReportStatusResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
