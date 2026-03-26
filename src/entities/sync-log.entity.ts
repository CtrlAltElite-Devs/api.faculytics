import {
  Entity,
  Index,
  ManyToOne,
  Opt,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { v4 } from 'uuid';
import { User } from './user.entity';
import type {
  SyncPhaseResult,
  SyncStatus,
  SyncTrigger,
} from '../modules/moodle/lib/sync-result.types';

// No deletedAt — audit records are never soft-deleted.
// Queries must use `filters: { softDelete: false }` to bypass the global filter.
@Entity()
export class SyncLog {
  @PrimaryKey()
  id: string & Opt = v4();

  @Property()
  trigger!: SyncTrigger;

  @ManyToOne(() => User, { nullable: true })
  triggeredBy?: User;

  @Property()
  status: SyncStatus & Opt = 'running';

  @Index()
  @Property()
  startedAt: Date & Opt = new Date();

  @Property({ nullable: true })
  completedAt?: Date;

  @Property({ nullable: true })
  durationMs?: number;

  @Property({ type: 'jsonb', nullable: true })
  categories?: SyncPhaseResult;

  @Property({ type: 'jsonb', nullable: true })
  courses?: SyncPhaseResult;

  @Property({ type: 'jsonb', nullable: true })
  enrollments?: SyncPhaseResult;

  @Property({ type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ nullable: true })
  jobId?: string;

  @Property({ nullable: true })
  cronExpression?: string;
}
