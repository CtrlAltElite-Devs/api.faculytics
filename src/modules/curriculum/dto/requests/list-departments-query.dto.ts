import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListDepartmentsQueryDto {
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
