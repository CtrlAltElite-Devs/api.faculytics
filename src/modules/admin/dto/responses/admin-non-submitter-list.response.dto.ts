import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';
import { AdminNonSubmitterItemResponseDto } from './admin-non-submitter-item.response.dto';

export class AdminNonSubmitterScopeDto {
  @ApiProperty()
  semesterId: string;

  @ApiProperty()
  semesterCode: string;

  @ApiPropertyOptional()
  semesterLabel?: string;

  @ApiPropertyOptional()
  academicYear?: string;
}

export class AdminNonSubmitterListResponseDto {
  @ApiProperty({ type: [AdminNonSubmitterItemResponseDto] })
  data: AdminNonSubmitterItemResponseDto[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;

  @ApiProperty({
    type: AdminNonSubmitterScopeDto,
    description:
      'Resolved scope for this response — surfaces the semester that was evaluated.',
  })
  scope: AdminNonSubmitterScopeDto;
}
