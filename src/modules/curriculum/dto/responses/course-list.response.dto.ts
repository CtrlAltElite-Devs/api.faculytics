import { ApiProperty } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { CourseItemResponseDto } from './course-item.response.dto';

export class CourseListResponseDto {
  @ApiProperty({ type: [CourseItemResponseDto] })
  data: CourseItemResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
