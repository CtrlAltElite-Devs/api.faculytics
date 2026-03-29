import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class FilterDepartmentsQueryDto {
  @ApiPropertyOptional({ description: 'Filter departments by campus UUID' })
  @IsUUID()
  @IsOptional()
  campusId?: string;
}
