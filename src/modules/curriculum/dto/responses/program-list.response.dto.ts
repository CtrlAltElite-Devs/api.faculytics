import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { ProgramItemResponseDto } from './program-item.response.dto';

export class ProgramListResponseDto {
  @ApiProperty({ type: [ProgramItemResponseDto] })
  data: ProgramItemResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
