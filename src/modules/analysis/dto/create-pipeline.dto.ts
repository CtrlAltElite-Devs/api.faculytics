import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export const createPipelineSchema = z.object({
  semesterId: z.string().uuid(),
  facultyId: z.string().uuid().optional(),
  questionnaireVersionId: z.string().uuid().optional(),
  questionnaireTypeCode: z.string().min(1).optional(),
  departmentId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  campusId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
});

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;

export class CreatePipelineDto {
  @ApiProperty({ description: 'Semester ID (required scope)' })
  @IsUUID()
  @IsNotEmpty()
  semesterId!: string;

  @ApiPropertyOptional({ description: 'Faculty user ID' })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

  @ApiPropertyOptional({ description: 'Questionnaire version ID' })
  @IsUUID()
  @IsOptional()
  questionnaireVersionId?: string;

  @ApiPropertyOptional({
    description:
      'Questionnaire type code; server resolves to the latest ACTIVE version for that type when versionId is omitted',
  })
  @IsString()
  @IsOptional()
  questionnaireTypeCode?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Program ID' })
  @IsUUID()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional({ description: 'Campus ID' })
  @IsUUID()
  @IsOptional()
  campusId?: string;

  @ApiPropertyOptional({ description: 'Course ID' })
  @IsUUID()
  @IsOptional()
  courseId?: string;
}
