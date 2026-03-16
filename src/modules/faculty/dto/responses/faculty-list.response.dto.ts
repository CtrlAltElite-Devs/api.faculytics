import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { FacultyCardResponseDto } from './faculty-card.response.dto';

export class FacultyListResponseDto {
  @ApiProperty({ type: [FacultyCardResponseDto] })
  data: FacultyCardResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
