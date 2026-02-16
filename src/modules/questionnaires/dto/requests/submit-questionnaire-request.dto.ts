import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  IsNotEmpty,
} from 'class-validator';

export class SubmitQuestionnaireRequest {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  versionId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  respondentId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  facultyId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  semesterId!: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  courseId?: string;

  @ApiProperty({ example: { q1: 5, q2: 4 } })
  @IsObject()
  @IsNotEmpty()
  answers!: Record<string, number>;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  qualitativeComment?: string;
}
