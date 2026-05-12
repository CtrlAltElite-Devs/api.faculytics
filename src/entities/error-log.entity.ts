import { Entity, Index, Opt, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 } from 'uuid';

// Error log rows capture unhandled 5xx exceptions for admin-side diagnostics.
// Never soft-deleted — queries must use `filters: { softDelete: false }`.
// Matches the SyncLog/AuditLog precedent of opting out of the global filter.
@Entity()
export class ErrorLog {
  @PrimaryKey()
  id: string & Opt = v4();

  @Index()
  @Property()
  statusCode!: number;

  @Property()
  method!: string;

  @Index()
  @Property()
  path!: string;

  @Index()
  @Property({ nullable: true })
  userId?: string;

  @Property({ nullable: true })
  userName?: string;

  @Index()
  @Property()
  errorName!: string;

  @Property({ type: 'text' })
  message!: string;

  @Property({ type: 'text', nullable: true })
  stack?: string;

  @Property({ type: 'jsonb', nullable: true })
  requestBody?: Record<string, unknown>;

  @Property({ type: 'jsonb', nullable: true })
  requestQuery?: Record<string, unknown>;

  @Property({ nullable: true })
  browserName?: string;

  @Property({ nullable: true })
  os?: string;

  @Property({ nullable: true })
  ipAddress?: string;

  @Index()
  @Property({ nullable: true })
  acknowledgedAt?: Date;

  @Property({ nullable: true })
  acknowledgedBy?: string;

  @Index()
  @Property({ defaultRaw: 'now()', length: 6 })
  occurredAt: Date & Opt = new Date();
}
