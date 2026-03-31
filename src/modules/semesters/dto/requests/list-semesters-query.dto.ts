import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListSemestersQueryDto {
  @ApiPropertyOptional({ description: 'Filter by campus UUID' })
  @IsUUID()
  @IsOptional()
  campusId?: string;
}
