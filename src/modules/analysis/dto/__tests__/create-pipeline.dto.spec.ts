import {
  createPipelineSchema,
  bridgeLegacyCreatePipelineInput,
} from '../create-pipeline.dto';

describe('CreatePipelineDto canonical shape + legacy bridge', () => {
  const SEMESTER = '11111111-1111-4111-8111-111111111111';
  const FACULTY = '22222222-2222-4222-8222-222222222222';
  const DEPT = '33333333-3333-4333-8333-333333333333';
  const CAMPUS = '44444444-4444-4444-8444-444444444444';

  it('AC1: accepts canonical {scopeType, scopeId, semesterId}', () => {
    const parsed = createPipelineSchema.parse({
      semesterId: SEMESTER,
      scopeType: 'FACULTY',
      scopeId: FACULTY,
    });
    expect(parsed.scopeType).toBe('FACULTY');
    expect(parsed.scopeId).toBe(FACULTY);
  });

  it('AC4: accepts scopeType=DEPARTMENT', () => {
    const parsed = createPipelineSchema.parse({
      semesterId: SEMESTER,
      scopeType: 'DEPARTMENT',
      scopeId: DEPT,
    });
    expect(parsed.scopeType).toBe('DEPARTMENT');
    expect(parsed.scopeId).toBe(DEPT);
  });

  it('AC5: accepts scopeType=CAMPUS', () => {
    const parsed = createPipelineSchema.parse({
      semesterId: SEMESTER,
      scopeType: 'CAMPUS',
      scopeId: CAMPUS,
    });
    expect(parsed.scopeType).toBe('CAMPUS');
  });

  it('AC6: rejects unknown scopeType value', () => {
    expect(() =>
      createPipelineSchema.parse({
        semesterId: SEMESTER,
        scopeType: 'BOGUS',
        scopeId: FACULTY,
      }),
    ).toThrow();
  });

  it('bridge: legacy facultyId maps to {scopeType:FACULTY, scopeId}', () => {
    const bridged = bridgeLegacyCreatePipelineInput({
      semesterId: SEMESTER,
      facultyId: FACULTY,
    }) as Record<string, unknown>;
    expect(bridged.scopeType).toBe('FACULTY');
    expect(bridged.scopeId).toBe(FACULTY);
    expect(bridged.facultyId).toBeUndefined();
  });

  it('bridge: legacy departmentId maps to DEPARTMENT', () => {
    const bridged = bridgeLegacyCreatePipelineInput({
      semesterId: SEMESTER,
      departmentId: DEPT,
    }) as Record<string, unknown>;
    expect(bridged.scopeType).toBe('DEPARTMENT');
    expect(bridged.scopeId).toBe(DEPT);
  });

  it('bridge: legacy campusId maps to CAMPUS', () => {
    const bridged = bridgeLegacyCreatePipelineInput({
      semesterId: SEMESTER,
      campusId: CAMPUS,
    }) as Record<string, unknown>;
    expect(bridged.scopeType).toBe('CAMPUS');
    expect(bridged.scopeId).toBe(CAMPUS);
  });

  it('bridge: silently drops programId + courseId + questionnaireTypeCode', () => {
    const bridged = bridgeLegacyCreatePipelineInput({
      semesterId: SEMESTER,
      scopeType: 'FACULTY',
      scopeId: FACULTY,
      programId: 'ignored',
      courseId: 'ignored',
      questionnaireTypeCode: 'FACULTY_FEEDBACK',
    }) as Record<string, unknown>;
    expect(bridged.programId).toBeUndefined();
    expect(bridged.courseId).toBeUndefined();
    expect(bridged.questionnaireTypeCode).toBeUndefined();
  });

  it('schema end-to-end: legacy input parses through bridge', () => {
    const parsed = createPipelineSchema.parse({
      semesterId: SEMESTER,
      facultyId: FACULTY,
      questionnaireTypeCode: 'FACULTY_FEEDBACK',
    });
    expect(parsed.scopeType).toBe('FACULTY');
    expect(parsed.scopeId).toBe(FACULTY);
    expect(
      (parsed as Record<string, unknown>).questionnaireTypeCode,
    ).toBeUndefined();
  });
});
