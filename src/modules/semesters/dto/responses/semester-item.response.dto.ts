import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CampusShortResponseDto } from './campus-short.response.dto';

export class SemesterItemResponseDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  academicYear?: string;

  @ApiProperty({ type: CampusShortResponseDto })
  @ValidateNested()
  @Type(() => CampusShortResponseDto)
  campus: CampusShortResponseDto;
}
