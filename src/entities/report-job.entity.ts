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
  @Index()
  batchId?: string;

  @Property({ nullable: true })
  storageKey?: string;

  @Property({ nullable: true, type: 'text' })
  error?: string;

  @Property({ nullable: true })
  completedAt?: Date;
}
