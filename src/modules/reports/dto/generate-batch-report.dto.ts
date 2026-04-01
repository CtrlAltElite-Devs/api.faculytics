import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class GenerateBatchReportDto {
  @ApiProperty({ description: 'UUID of the semester' })
  @IsUUID()
  semesterId: string;

  @ApiProperty({ description: 'Questionnaire type code' })
  @IsString()
  @IsNotEmpty()
  questionnaireTypeCode: string;

  @ApiPropertyOptional({ description: 'Optional department UUID to filter by' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Optional program UUID to filter by' })
  @IsUUID()
  @IsOptional()
  programId?: string;
}
