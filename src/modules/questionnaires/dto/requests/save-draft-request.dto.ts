import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { IsValidAnswers } from '../../validators/answers-validator';

export class SaveDraftRequest {
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

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  courseId?: string;

  @ApiProperty({ example: { q1: 5, q2: 4 } })
  @IsValidAnswers()
  answers!: Record<string, number>;

  @ApiProperty({ required: false, maxLength: 10000 })
  @IsString()
  @IsOptional()
  @MaxLength(10000, {
    message: 'Qualitative comment must not exceed 10000 characters',
  })
  qualitativeComment?: string;
}
