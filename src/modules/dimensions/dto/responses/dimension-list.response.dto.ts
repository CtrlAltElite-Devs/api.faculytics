import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { DimensionResponseDto } from './dimension.response.dto';

export class DimensionListResponseDto {
  @ApiProperty({ type: [DimensionResponseDto] })
  data: DimensionResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
