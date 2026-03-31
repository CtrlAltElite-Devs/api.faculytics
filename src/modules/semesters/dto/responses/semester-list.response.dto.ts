import { ApiProperty } from '@nestjs/swagger';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SemesterItemResponseDto } from './semester-item.response.dto';

export class SemesterListResponseDto {
  @ApiProperty({ type: [SemesterItemResponseDto] })
  @ValidateNested({ each: true })
  @Type(() => SemesterItemResponseDto)
  data: SemesterItemResponseDto[];
}
