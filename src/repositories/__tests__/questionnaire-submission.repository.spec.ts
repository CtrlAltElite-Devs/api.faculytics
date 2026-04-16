import { QuestionnaireSubmissionRepository } from '../questionnaire-submission.repository';

describe('QuestionnaireSubmissionRepository.FindChangedSince', () => {
  it('uses createdAt > since when since is non-null (Task B1 critical-semantic)', async () => {
    const find = jest.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    const repo = Object.assign(
      Object.create(QuestionnaireSubmissionRepository.prototype),
      { find },
    ) as QuestionnaireSubmissionRepository;

    const since = new Date('2026-04-10T00:00:00Z');
    const result = await repo.FindChangedSince(
      { semester: 'sem-1', faculty: 'fac-1' },
      since,
    );

    expect(result).toEqual({ ids: ['s1', 's2'], count: 2 });
    expect(find).toHaveBeenCalledWith(
      {
        semester: 'sem-1',
        faculty: 'fac-1',
        createdAt: { $gt: since },
      },
      { fields: ['id'] },
    );
  });

  it('omits createdAt predicate when since is null (returns all in scope)', async () => {
    const find = jest.fn().mockResolvedValue([{ id: 'a' }]);
    const repo = Object.assign(
      Object.create(QuestionnaireSubmissionRepository.prototype),
      { find },
    ) as QuestionnaireSubmissionRepository;

    const result = await repo.FindChangedSince(
      { semester: 'sem-1', department: 'dept-1' },
      null,
    );
    expect(result).toEqual({ ids: ['a'], count: 1 });
    expect(find).toHaveBeenCalledWith(
      { semester: 'sem-1', department: 'dept-1' },
      { fields: ['id'] },
    );
  });

  it('threads campus / program / course / questionnaireVersion filters', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repo = Object.assign(
      Object.create(QuestionnaireSubmissionRepository.prototype),
      { find },
    ) as QuestionnaireSubmissionRepository;

    await repo.FindChangedSince(
      {
        semester: 'sem-1',
        campus: 'camp-1',
        program: 'prog-1',
        course: 'course-1',
        questionnaireVersion: 'qv-1',
      },
      null,
    );
    expect(find).toHaveBeenCalledWith(
      {
        semester: 'sem-1',
        campus: 'camp-1',
        program: 'prog-1',
        course: 'course-1',
        questionnaireVersion: 'qv-1',
      },
      { fields: ['id'] },
    );
  });
});
