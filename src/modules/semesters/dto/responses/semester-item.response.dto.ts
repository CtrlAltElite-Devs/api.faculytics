import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsOptional, IsString, ValidateNested } from 'class-validator';
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

  @ApiProperty()
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @ApiPropertyOptional()
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @ApiProperty({ type: CampusShortResponseDto })
  @ValidateNested()
  @Type(() => CampusShortResponseDto)
  campus: CampusShortResponseDto;
}
