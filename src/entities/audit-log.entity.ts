import { Entity, Index, Opt, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 } from 'uuid';

// Audit records are never soft-deleted. Queries must use
// `filters: { softDelete: false }` to bypass the global filter.
// See SyncLog for precedent.
@Entity()
export class AuditLog {
  @PrimaryKey()
  id: string & Opt = v4();

  @Index()
  @Property()
  action!: string;

  @Index()
  @Property({ nullable: true })
  actorId?: string;

  @Property({ nullable: true })
  actorUsername?: string;

  @Property({ nullable: true })
  resourceType?: string;

  @Property({ nullable: true })
  resourceId?: string;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Property({ nullable: true })
  browserName?: string;

  @Property({ nullable: true })
  os?: string;

  @Property({ nullable: true })
  ipAddress?: string;

  @Index()
  @Property({ defaultRaw: 'now()', length: 6 })
  occurredAt: Date & Opt = new Date();
}
