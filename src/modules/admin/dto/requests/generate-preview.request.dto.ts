import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class GeneratePreviewRequestDto {
  @ApiProperty({ description: 'Questionnaire version UUID' })
  @IsUUID()
  @IsNotEmpty()
  versionId: string;

  @ApiProperty({ description: 'Faculty username (exact match)' })
  @IsString()
  @IsNotEmpty()
  facultyUsername: string;

  @ApiProperty({ description: 'Course shortname (exact match)' })
  @IsString()
  @IsNotEmpty()
  courseShortname: string;
}
