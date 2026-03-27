import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { AdminUserItemResponseDto } from './admin-user-item.response.dto';

export class AdminUserListResponseDto {
  @ApiProperty({ type: [AdminUserItemResponseDto] })
  data: AdminUserItemResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
