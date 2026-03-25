import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { SyncLogResponseDto } from './sync-log.response.dto';

export class SyncHistoryResponseDto {
  @ApiProperty({ type: [SyncLogResponseDto] })
  data: SyncLogResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
