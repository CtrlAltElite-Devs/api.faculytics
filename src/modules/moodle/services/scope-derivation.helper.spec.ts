import { Department } from 'src/entities/department.entity';
import { Program } from 'src/entities/program.entity';
import { deriveUserScopes } from './scope-derivation.helper';

const makeDepartment = (id: string): Department =>
  ({ id, name: `dept-${id}` }) as Department;

const makeProgram = (
  id: string,
  moodleCategoryId: number,
  department: Department,
): Program =>
  ({
    id,
    moodleCategoryId,
    department,
  }) as unknown as Program;

describe('deriveUserScopes', () => {
  it('returns null/null for empty enrollments', () => {
    const result = deriveUserScopes({ enrollments: [] });
    expect(result.primaryProgram).toBeNull();
    expect(result.primaryDepartment).toBeNull();
  });

  it('returns the only program when all enrollments share it', () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);

    const result = deriveUserScopes({
      enrollments: [{ program }, { program }, { program }],
    });

    expect(result.primaryProgram).toBe(program);
    expect(result.primaryDepartment).toBe(dept);
  });

  it('picks the majority program (3 vs 2)', () => {
    const dept = makeDepartment('d1');
    const programA = makeProgram('pa', 100, dept);
    const programB = makeProgram('pb', 200, dept);

    const result = deriveUserScopes({
      enrollments: [
        { program: programA },
        { program: programA },
        { program: programA },
        { program: programB },
        { program: programB },
      ],
    });

    expect(result.primaryProgram).toBe(programA);
  });

  it('breaks ties using alphabetical moodleCategoryId', () => {
    const dept = makeDepartment('d1');
    const programA = makeProgram('pa', 200, dept);
    const programB = makeProgram('pb', 100, dept);

    const result = deriveUserScopes({
      enrollments: [
        { program: programA },
        { program: programA },
        { program: programB },
        { program: programB },
      ],
    });

    // moodleCategoryId 100 < 200 alphabetically (string compare)
    expect(result.primaryProgram).toBe(programB);
  });

  it('uses moodleCategoryId for tiebreak, NOT id (UUID)', () => {
    const dept = makeDepartment('d1');
    // UUID order: 'aaa' < 'zzz'  but moodleCategoryId order: '999' > '100'
    const programA = makeProgram('aaa', 999, dept);
    const programB = makeProgram('zzz', 100, dept);

    const result = deriveUserScopes({
      enrollments: [{ program: programA }, { program: programB }],
    });

    // If tiebreak used UUID, programA ('aaa') would win.
    // It must use moodleCategoryId, so programB ('100') wins.
    expect(result.primaryProgram).toBe(programB);
  });

  it('returns null/null when chosen program has no department (atomic guard)', () => {
    const program = makeProgram('p1', 100, undefined as unknown as Department);

    const result = deriveUserScopes({
      enrollments: [{ program }, { program }],
    });

    // Even though a program "wins", we refuse to return a partial result.
    expect(result.primaryProgram).toBeNull();
    expect(result.primaryDepartment).toBeNull();
  });

  it('skips enrollments with undefined program', () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);

    const result = deriveUserScopes({
      enrollments: [
        { program: undefined },
        { program },
        { program: undefined },
      ],
    });

    expect(result.primaryProgram).toBe(program);
    expect(result.primaryDepartment).toBe(dept);
  });
});
