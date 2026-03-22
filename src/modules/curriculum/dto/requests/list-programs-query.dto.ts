import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListProgramsQueryDto {
  @ApiProperty({ description: 'Semester UUID to scope program list' })
  @IsUUID()
  @IsNotEmpty()
  semesterId: string;

  @ApiPropertyOptional({ description: 'Filter by department UUID' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Search by program code or name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;
}
