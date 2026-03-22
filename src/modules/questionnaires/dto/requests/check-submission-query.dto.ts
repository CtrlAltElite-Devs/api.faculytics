import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsNotEmpty } from 'class-validator';

export class CheckSubmissionQuery {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  versionId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  facultyId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  semesterId!: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  courseId?: string;
}
