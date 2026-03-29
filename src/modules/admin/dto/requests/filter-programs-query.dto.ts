import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class FilterProgramsQueryDto {
  @ApiPropertyOptional({ description: 'Filter programs by department UUID' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}
