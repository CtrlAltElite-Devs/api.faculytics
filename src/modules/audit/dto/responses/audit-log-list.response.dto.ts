import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { AuditLogItemResponseDto } from './audit-log-item.response.dto';

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogItemResponseDto] })
  data: AuditLogItemResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
