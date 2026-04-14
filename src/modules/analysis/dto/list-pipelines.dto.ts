import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export const listPipelinesQuerySchema = z.object({
  semesterId: z.string().uuid(),
  facultyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  campusId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  questionnaireVersionId: z.string().uuid().optional(),
});

export type ListPipelinesQueryInput = z.infer<typeof listPipelinesQuerySchema>;

export class ListPipelinesQueryDto {
  @ApiProperty({ description: 'Semester ID (required)' })
  @IsUUID()
  @IsNotEmpty()
  semesterId!: string;

  @ApiPropertyOptional({ description: 'Faculty user ID' })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

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

  @ApiPropertyOptional({ description: 'Questionnaire version ID' })
  @IsUUID()
  @IsOptional()
  questionnaireVersionId?: string;
}
