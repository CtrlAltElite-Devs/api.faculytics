import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Logger } from '@nestjs/common';
import { SCOPE_TYPE_VALUES, scopeTypeSchema } from './facet.dto';

const deprecationLogger = new Logger('ListPipelinesQueryDto');

const listPipelinesCanonicalSchema = z.object({
  semesterId: z.string().uuid(),
  scopeType: scopeTypeSchema.optional(),
  scopeId: z.string().uuid().optional(),
  questionnaireVersionId: z.string().uuid().optional(),
});

const LEGACY_SCOPE_FIELD_TO_TYPE: Record<
  string,
  'FACULTY' | 'DEPARTMENT' | 'CAMPUS'
> = {
  facultyId: 'FACULTY',
  departmentId: 'DEPARTMENT',
  campusId: 'CAMPUS',
};

const LEGACY_DROPPABLE_FIELDS = [
  'programId',
  'courseId',
  'questionnaireTypeCode',
] as const;

/** PHASE_A_PREPROCESSOR_REMOVE_IN_PR3 — see create-pipeline.dto.ts for rationale. */
export function bridgeLegacyListPipelinesInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const deprecated: string[] = [];

  for (const field of LEGACY_DROPPABLE_FIELDS) {
    if (field in obj) {
      deprecated.push(field);
      delete obj[field];
    }
  }

  if ('scopeType' in obj || 'scopeId' in obj) {
    for (const legacy of Object.keys(LEGACY_SCOPE_FIELD_TO_TYPE)) {
      if (legacy in obj) {
        deprecated.push(legacy);
        delete obj[legacy];
      }
    }
  } else {
    for (const [legacy, type] of Object.entries(LEGACY_SCOPE_FIELD_TO_TYPE)) {
      const value = obj[legacy];
      if (typeof value === 'string' && value.length > 0) {
        obj.scopeType = type;
        obj.scopeId = value;
        deprecated.push(legacy);
        delete obj[legacy];
        break;
      }
    }
    for (const legacy of Object.keys(LEGACY_SCOPE_FIELD_TO_TYPE)) {
      if (legacy in obj) {
        deprecated.push(legacy);
        delete obj[legacy];
      }
    }
  }

  if (deprecated.length > 0) {
    deprecationLogger.warn(
      `deprecated_field_used: ${JSON.stringify({ fields: deprecated })}`,
    );
  }
  return obj;
}

export const listPipelinesQuerySchema = z.preprocess(
  bridgeLegacyListPipelinesInput,
  listPipelinesCanonicalSchema,
);

export type ListPipelinesQueryInput = z.infer<typeof listPipelinesQuerySchema>;

export class ListPipelinesQueryDto {
  @ApiProperty({ description: 'Semester ID (required)' })
  @IsUUID()
  @IsNotEmpty()
  semesterId!: string;

  @ApiPropertyOptional({
    enum: SCOPE_TYPE_VALUES,
    description: 'Filter by scope tier',
  })
  @IsEnum(SCOPE_TYPE_VALUES)
  @IsOptional()
  scopeType?: (typeof SCOPE_TYPE_VALUES)[number];

  @ApiPropertyOptional({
    description: 'Filter by scope id (faculty/department/campus UUID)',
  })
  @IsUUID()
  @IsOptional()
  scopeId?: string;

  @ApiPropertyOptional({ description: 'Questionnaire version ID' })
  @IsUUID()
  @IsOptional()
  questionnaireVersionId?: string;
}
