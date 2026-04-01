import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class GenerateReportDto {
  @ApiProperty({ description: 'UUID of the faculty member' })
  @IsUUID()
  facultyId: string;

  @ApiProperty({ description: 'UUID of the semester' })
  @IsUUID()
  semesterId: string;

  @ApiProperty({ description: 'Questionnaire type code' })
  @IsString()
  @IsNotEmpty()
  questionnaireTypeCode: string;
}
