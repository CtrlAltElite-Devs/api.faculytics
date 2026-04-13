import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { deriveUserScopes } from './scope-derivation.helper';

/**
 * Convergence regression: cron path (EnrollmentSyncService.backfillUserScopes)
 * and login path (MoodleUserHydrationService.hydrateUserCourses) must derive
 * identical (primaryProgram, primaryDepartment) for the same enrollment input.
 *
 * Both call deriveUserScopes() — this test ensures the helper itself is
 * deterministic and that any future refactor introducing path divergence
 * is caught immediately (F7).
 */

const makeDepartment = (id: string): Department =>
  ({ id, name: `dept-${id}` }) as Department;

const makeProgram = (
  id: string,
  moodleCategoryId: number,
  department: Department,
): Program => ({ id, moodleCategoryId, department }) as unknown as Program;

describe('scope derivation convergence (cron vs login)', () => {
  it('produces identical results for the same enrollment set (tie scenario)', () => {
    const dept = makeDepartment('d1');
    // tie: 2 enrollments each, must be broken by alphabetical moodleCategoryId
    const programA = makeProgram('uuid-aaa', 999, dept);
    const programB = makeProgram('uuid-bbb', 100, dept);

    const enrollments = [
      { program: programA },
      { program: programB },
      { program: programA },
      { program: programB },
    ];

    // "Cron" call
    const cronResult = deriveUserScopes({ enrollments });
    // "Login" call (different array reference, same content)
    const loginResult = deriveUserScopes({ enrollments: [...enrollments] });

    expect(cronResult.primaryProgram?.id).toBe(loginResult.primaryProgram?.id);
    expect(cronResult.primaryDepartment?.id).toBe(
      loginResult.primaryDepartment?.id,
    );
    // Tiebreaker confirms moodleCategoryId 100 < 999
    expect(cronResult.primaryProgram?.id).toBe('uuid-bbb');
  });

  it('produces identical results for majority scenario', () => {
    const dept1 = makeDepartment('d1');
    const dept2 = makeDepartment('d2');
    const programA = makeProgram('pa', 100, dept1);
    const programB = makeProgram('pb', 200, dept2);

    const enrollments = [
      { program: programA },
      { program: programA },
      { program: programA },
      { program: programB },
      { program: programB },
    ];

    const cronResult = deriveUserScopes({ enrollments });
    const loginResult = deriveUserScopes({ enrollments: [...enrollments] });

    expect(cronResult.primaryProgram?.id).toBe('pa');
    expect(loginResult.primaryProgram?.id).toBe('pa');
    expect(cronResult.primaryDepartment?.id).toBe('d1');
    expect(loginResult.primaryDepartment?.id).toBe('d1');
  });

  it('agrees on null when no resolvable enrollments', () => {
    const cronResult = deriveUserScopes({ enrollments: [] });
    const loginResult = deriveUserScopes({
      enrollments: [{ program: undefined }],
    });

    expect(cronResult.primaryProgram).toBeNull();
    expect(loginResult.primaryProgram).toBeNull();
    expect(cronResult.primaryDepartment).toBeNull();
    expect(loginResult.primaryDepartment).toBeNull();
  });
});
