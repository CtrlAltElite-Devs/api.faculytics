import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListNonSubmittersQueryDto {
  @ApiPropertyOptional({
    description: 'Search by username, full name, first name, last name, or id',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Semester UUID to scope the lookup to. Defaults to the latest semester if omitted.',
  })
  @IsUUID()
  @IsOptional()
  semesterId?: string;

  @ApiPropertyOptional({
    description:
      'Restrict the pool to students enrolled in the course taught by this faculty username.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  facultyUsername?: string;

  @ApiPropertyOptional({
    description: 'Restrict the pool to students enrolled in this course UUID.',
  })
  @IsUUID()
  @IsOptional()
  courseId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
