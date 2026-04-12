import { Entity, Index, ManyToOne, Opt, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { User } from './user.entity';
import { ReportJobRepository } from '../repositories/report-job.repository';

export type ReportJobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'skipped';

@Index({
  name: 'uq_report_job_pending',
  expression: `create unique index "uq_report_job_pending" on "report_job" ("faculty_id", "semester_id", "questionnaire_type_code", "report_type") where status in ('waiting', 'active') and deleted_at is null`,
})
@Index({
  name: 'report_job_batch_id_index',
  expression:
    'create index "report_job_batch_id_index" on "report_job" ("batch_id") where batch_id is not null',
})
@Index({
  name: 'report_job_status_completed_at_index',
  properties: ['status', 'completedAt'],
})
@Entity({ repository: () => ReportJobRepository })
export class ReportJob extends CustomBaseEntity {
  @Property()
  reportType: string;

  @Property()
  @Index()
  status: ReportJobStatus & Opt = 'waiting';

  @ManyToOne(() => User)
  @Index()
  requestedBy: User;

  @Property()
  facultyId: string;

  @Property()
  facultyName: string;

  @Property()
  semesterId: string;

  @Property()
  questionnaireTypeCode: string;

  @Property({ nullable: true })
  // Indexed via class-level @Index (name: 'report_job_batch_id_index') — see top of file
  batchId?: string;

  @Property({ nullable: true })
  storageKey?: string;

  @Property({ nullable: true, type: 'text' })
  error?: string;

  @Property({ nullable: true })
  completedAt?: Date;
}
