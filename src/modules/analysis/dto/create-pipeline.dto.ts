import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Logger } from '@nestjs/common';
import { SCOPE_TYPE_VALUES, scopeTypeSchema } from './facet.dto';

const deprecationLogger = new Logger('CreatePipelineDto');

// Canonical schema (post-preprocess). This is what the orchestrator consumes.
// `scopeType` is optional at parse time when auto-fill can resolve it from the
// caller's single assigned scope (preserves FAC-132 auto-fill behavior).
// assertCanCreatePipeline enforces presence post-auto-fill.
const createPipelineCanonicalSchema = z.object({
  semesterId: z.string().uuid(),
  scopeType: scopeTypeSchema.optional(),
  scopeId: z.string().uuid().optional(),
  questionnaireVersionId: z.string().uuid().optional(),
});

// Legacy field names accepted transiently for Phase A → Phase C staggered merge.
// Removed in PR-3 (hard cutover). Do not add new legacy fields here.
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

/**
 * PHASE_A_PREPROCESSOR_REMOVE_IN_PR3: bridging preprocessor that maps the
 * legacy multi-FK shape onto the canonical {scopeType, scopeId} pair. Its
 * only job is to keep `develop` green while the frontend migrates in PR-2.
 * Delete this function + the `.preprocess` wrapping in PR-3 and switch the
 * canonical schema to `.strict()`.
 */
export function bridgeLegacyCreatePipelineInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const deprecated: string[] = [];

  // Dropped fields: silently remove if caller already provided canonical shape.
  for (const field of LEGACY_DROPPABLE_FIELDS) {
    if (field in obj) {
      deprecated.push(field);
      delete obj[field];
    }
  }

  // If canonical shape already present, just warn about legacy drops and return.
  if ('scopeType' in obj || 'scopeId' in obj) {
    for (const legacy of Object.keys(LEGACY_SCOPE_FIELD_TO_TYPE)) {
      if (legacy in obj) {
        deprecated.push(legacy);
        delete obj[legacy];
      }
    }
    if (deprecated.length > 0) {
      deprecationLogger.warn(
        `deprecated_field_used: ${JSON.stringify({ fields: deprecated })}`,
      );
    }
    return obj;
  }

  // Otherwise, map legacy scope fields to canonical. First non-empty wins;
  // ambiguous inputs still pass through unchanged so validation surfaces them.
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
  // Drop any remaining legacy scope fields even if unused (so they don't trip strict mode later).
  for (const legacy of Object.keys(LEGACY_SCOPE_FIELD_TO_TYPE)) {
    if (legacy in obj) {
      deprecated.push(legacy);
      delete obj[legacy];
    }
  }

  if (deprecated.length > 0) {
    deprecationLogger.warn(
      `deprecated_field_used: ${JSON.stringify({ fields: deprecated })}`,
    );
  }
  return obj;
}

export const createPipelineSchema = z.preprocess(
  bridgeLegacyCreatePipelineInput,
  createPipelineCanonicalSchema,
);

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;

export class CreatePipelineDto {
  @ApiProperty({ description: 'Semester ID (required scope)' })
  @IsUUID()
  @IsNotEmpty()
  semesterId!: string;

  @ApiPropertyOptional({
    enum: SCOPE_TYPE_VALUES,
    description:
      'Pipeline scope tier (auto-filled for callers with exactly one assigned scope)',
  })
  @IsEnum(SCOPE_TYPE_VALUES)
  @IsOptional()
  scopeType?: (typeof SCOPE_TYPE_VALUES)[number];

  @ApiPropertyOptional({
    description:
      'UUID of the faculty/department/campus for this scope (auto-filled when omitted)',
  })
  @IsUUID()
  @IsOptional()
  scopeId?: string;

  @ApiPropertyOptional({
    description:
      'Optional questionnaire version to pin. When omitted, the pipeline ingests submissions across all active versions in scope.',
  })
  @IsUUID()
  @IsOptional()
  questionnaireVersionId?: string;
}
