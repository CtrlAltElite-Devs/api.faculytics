export type CompositeQuestionnaireTypeCode =
  | 'FACULTY_FEEDBACK'
  | 'FACULTY_IN_CLASSROOM'
  | 'FACULTY_OUT_OF_CLASSROOM';

export const COMPOSITE_WEIGHTS = {
  FACULTY_FEEDBACK: 0.5,
  FACULTY_OUT_OF_CLASSROOM: 0.25,
  FACULTY_IN_CLASSROOM: 0.25,
} as const satisfies Record<CompositeQuestionnaireTypeCode, number>;

export const COMPOSITE_COVERAGE_THRESHOLD = 0.5;

export const COMPOSITE_COVERAGE_STATUSES = [
  'FULL',
  'PARTIAL',
  'PARTIAL_NO_FEEDBACK',
  'FEEDBACK_ONLY',
  'INSUFFICIENT',
  'NO_DATA',
] as const;

export type CompositeCoverageStatus =
  (typeof COMPOSITE_COVERAGE_STATUSES)[number];

export const COMPOSITE_TYPE_ORDER: readonly CompositeQuestionnaireTypeCode[] = [
  'FACULTY_FEEDBACK',
  'FACULTY_OUT_OF_CLASSROOM',
  'FACULTY_IN_CLASSROOM',
] as const;

/**
 * Shared 2-decimal rounding — single source of truth for composite math and
 * BuildFacultyReportData so rounding never drifts between the composite
 * endpoint and the per-type /report endpoint.
 */
export const round2 = (x: number): number => Math.round(x * 100) / 100;
