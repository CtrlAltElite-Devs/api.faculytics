import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { PaginationQueryDto } from 'src/modules/common/dto/pagination-query.dto';

export class GetFacultyEnrollmentsQueryDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Semester UUID to scope faculty enrollments' })
  @IsUUID()
  @IsNotEmpty()
  semesterId!: string;
}
