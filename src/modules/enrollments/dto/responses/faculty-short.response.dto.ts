import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FacultyShortResponseDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  employeeNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  profilePicture?: string;
}
