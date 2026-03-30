import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from 'src/modules/common/dto/pagination-query.dto';

export class ListDepartmentsQueryDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Semester UUID to scope department list' })
  @IsUUID()
  @IsNotEmpty()
  semesterId: string;

  @ApiPropertyOptional({ description: 'Search by department code or name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;
}
