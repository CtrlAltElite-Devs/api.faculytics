import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { QuestionnaireType } from '../../questionnaire.types';

export class CreateQuestionnaireRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({
    enum: [
      'FACULTY_IN_CLASSROOM',
      'FACULTY_OUT_OF_CLASSROOM',
      'FACULTY_FEEDBACK',
    ],
  })
  @IsEnum([
    'FACULTY_IN_CLASSROOM',
    'FACULTY_OUT_OF_CLASSROOM',
    'FACULTY_FEEDBACK',
  ])
  type!: QuestionnaireType;
}
