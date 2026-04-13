import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';

export interface ScopeDerivationInput {
  enrollments: Array<{ program: Program | undefined }>;
}

export interface ScopeDerivationResult {
  primaryProgram: Program | null;
  primaryDepartment: Department | null;
}

/**
 * Pure helper: given a user's enrollments, derive the primary program
 * (most enrollments wins; tiebreaker = alphabetically first moodleCategoryId).
 *
 * Used by both:
 * - EnrollmentSyncService.backfillUserScopes (cron path)
 * - MoodleUserHydrationService.hydrateUserCourses (login path)
 *
 * Convergence is enforced by both paths calling this single function.
 */
export function deriveUserScopes(
  input: ScopeDerivationInput,
): ScopeDerivationResult {
  const programCounts = new Map<string, { program: Program; count: number }>();

  for (const enrollment of input.enrollments) {
    const program = enrollment.program;
    if (!program) continue;
    const entry = programCounts.get(program.id);
    if (entry) {
      entry.count++;
    } else {
      programCounts.set(program.id, { program, count: 1 });
    }
  }

  let primaryProgram: Program | null = null;
  let maxCount = 0;
  for (const { program, count } of programCounts.values()) {
    if (count > maxCount) {
      maxCount = count;
      primaryProgram = program;
    } else if (count === maxCount && primaryProgram) {
      // Env-stable tiebreaker: alphabetical moodleCategoryId
      if (
        String(program.moodleCategoryId) <
        String(primaryProgram.moodleCategoryId)
      ) {
        primaryProgram = program;
      }
    }
  }

  // Atomic rule: department + program are derived as a pair. If the chosen
  // program's department is not resolvable (FK missing or unpopulated), treat
  // the whole derivation as null rather than silently wiping user.department.
  const primaryDepartment = primaryProgram?.department ?? null;
  if (primaryProgram && !primaryDepartment) {
    return { primaryProgram: null, primaryDepartment: null };
  }

  return { primaryProgram, primaryDepartment };
}
