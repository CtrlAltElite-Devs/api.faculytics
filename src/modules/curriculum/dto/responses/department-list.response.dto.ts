import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { DepartmentItemResponseDto } from './department-item.response.dto';

export class DepartmentListResponseDto {
  @ApiProperty({ type: [DepartmentItemResponseDto] })
  data: DepartmentItemResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
