import { ApiProperty } from '@nestjs/swagger';

export class FacultyQuestionnaireTypeOptionDto {
  @ApiProperty({ description: 'Questionnaire type code' })
  code!: string;

  @ApiProperty({ description: 'Display name of the questionnaire type' })
  name!: string;

  @ApiProperty({
    description: 'Number of submissions for this faculty/semester/type',
  })
  submissionCount!: number;
}

export class FacultyQuestionnaireTypesResponseDto {
  @ApiProperty({
    type: [FacultyQuestionnaireTypeOptionDto],
    description:
      'Questionnaire types with submission counts for the faculty in the given semester (only types with submissionCount > 0)',
  })
  items!: FacultyQuestionnaireTypeOptionDto[];
}
