import { EntityRepository } from '@mikro-orm/postgresql';
import { QuestionnaireSubmission } from '../entities/questionnaire-submission.entity';

export interface SubmissionScopeFilter {
  semester: string;
  faculty?: string;
  department?: string;
  campus?: string;
  program?: string;
  course?: string;
  questionnaireVersion?: string;
}

export class QuestionnaireSubmissionRepository extends EntityRepository<QuestionnaireSubmission> {
  /**
   * Skip-check helper for the tiered scheduler. Uses `createdAt > since`,
   * NOT `updatedAt`. Submissions are immutable in this domain (no student
   * edit flow), so `createdAt` is the correct freshness signal — child
   * entity changes (sentiment results, comment cleaning) do not propagate
   * to the submission row's `updatedAt`, which would mask stale data as
   * fresh. See FAC-135 Task B1 for the locked rationale.
   */
  async FindChangedSince(
    scope: SubmissionScopeFilter,
    since: Date | null,
  ): Promise<{ ids: string[]; count: number }> {
    const filter: Record<string, unknown> = { semester: scope.semester };
    if (scope.faculty) filter.faculty = scope.faculty;
    if (scope.department) filter.department = scope.department;
    if (scope.campus) filter.campus = scope.campus;
    if (scope.program) filter.program = scope.program;
    if (scope.course) filter.course = scope.course;
    if (scope.questionnaireVersion)
      filter.questionnaireVersion = scope.questionnaireVersion;
    if (since) filter.createdAt = { $gt: since };

    const rows = await this.find(filter, { fields: ['id'] });
    const ids = rows.map((r) => r.id);
    return { ids, count: ids.length };
  }
}
