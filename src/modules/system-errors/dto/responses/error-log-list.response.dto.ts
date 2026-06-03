import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { ErrorLogItemResponseDto } from './error-log-item.response.dto';

export class ErrorLogListResponseDto {
  @ApiProperty({ type: [ErrorLogItemResponseDto] })
  data: ErrorLogItemResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
