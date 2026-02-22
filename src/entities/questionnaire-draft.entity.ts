import { Entity, Property, ManyToOne, Index } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireDraftRepository } from '../repositories/questionnaire-draft.repository';
import { QuestionnaireVersion } from './questionnaire-version.entity';
import { User } from './user.entity';
import { Semester } from './semester.entity';
import { Course } from './course.entity';

/**
 * Draft questionnaire submission entity
 *
 * Uniqueness is enforced via partial database indexes (see migration) to properly handle:
 * - NULL course_id values (separate index for with/without course)
 * - Soft deletes (uniqueness only enforced where deleted_at IS NULL)
 *
 * TODO: Implement cleanup mechanism for old drafts
 * - Consider TTL-based automatic deletion (e.g., drafts older than 90 days)
 * - Or implement cron job to periodically clean up stale drafts
 * - Should respect soft delete pattern for audit trail
 */
@Entity({ repository: () => QuestionnaireDraftRepository })
@Index({ properties: ['respondent', 'updatedAt'] })
// ✅ Unique index when course IS NOT NULL
@Index({
  name: 'questionnaire_draft_unique_active_with_course',
  properties: [
    'respondent',
    'questionnaireVersion',
    'faculty',
    'semester',
    'course',
  ],
  options: {
    where: 'deleted_at IS NULL AND course_id IS NOT NULL',
  },
})
// ✅ Unique index when course IS NULL
@Index({
  name: 'questionnaire_draft_unique_active_without_course',
  properties: ['respondent', 'questionnaireVersion', 'faculty', 'semester'],
  options: {
    where: 'deleted_at IS NULL AND course_id IS NULL',
  },
})
export class QuestionnaireDraft extends CustomBaseEntity {
  @ManyToOne(() => User)
  respondent!: User;

  @ManyToOne(() => QuestionnaireVersion)
  questionnaireVersion!: QuestionnaireVersion;

  @ManyToOne(() => User)
  faculty!: User;

  @ManyToOne(() => Semester)
  semester!: Semester;

  @ManyToOne(() => Course, { nullable: true })
  course?: Course;

  @Property({ type: 'jsonb' })
  answers!: Record<string, number>;

  @Property({ type: 'text', nullable: true })
  qualitativeComment?: string;
}
