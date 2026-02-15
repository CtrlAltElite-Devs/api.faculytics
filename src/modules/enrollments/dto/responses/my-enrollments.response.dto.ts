import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentResponseDto } from './enrollment.response.dto';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationMeta } from 'src/modules/common/dto/pagination.dto';

export class MyEnrollmentsResponseDto {
  @ApiProperty({ type: [EnrollmentResponseDto] })
  @ValidateNested({ each: true })
  @Type(() => EnrollmentResponseDto)
  data: EnrollmentResponseDto[];

  @ApiProperty()
  meta: PaginationMeta;
}
