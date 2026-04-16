import { z } from 'zod';

export const FACET_VALUES = [
  'overall',
  'facultyFeedback',
  'inClassroom',
  'outOfClassroom',
] as const;

export const facetSchema = z.enum(FACET_VALUES);

export type Facet = z.infer<typeof facetSchema>;

export const SCOPE_TYPE_VALUES = ['FACULTY', 'DEPARTMENT', 'CAMPUS'] as const;

export const scopeTypeSchema = z.enum(SCOPE_TYPE_VALUES);

export type ScopeType = z.infer<typeof scopeTypeSchema>;

// Primary questionnaire type codes mapped to their facet identifiers.
// Non-primary codes fold into `overall` downstream.
export const PRIMARY_QUESTIONNAIRE_CODE_TO_FACET: Record<
  string,
  Exclude<Facet, 'overall'>
> = {
  FACULTY_FEEDBACK: 'facultyFeedback',
  FACULTY_IN_CLASSROOM: 'inClassroom',
  FACULTY_OUT_OF_CLASSROOM: 'outOfClassroom',
};

export const PRIMARY_QUESTIONNAIRE_CODES = Object.keys(
  PRIMARY_QUESTIONNAIRE_CODE_TO_FACET,
) as readonly string[];

export function facetFromQuestionnaireCode(
  code: string | null | undefined,
): Facet {
  if (!code) return 'overall';
  return PRIMARY_QUESTIONNAIRE_CODE_TO_FACET[code] ?? 'overall';
}
