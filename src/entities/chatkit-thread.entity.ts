import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import type { ThreadStatus } from 'chatkit-node-backend-sdk';
import { User } from './user.entity';

@Entity({ tableName: 'chatkit_thread' })
@Index({ properties: ['user', 'createdAt'] })
export class ChatKitThread {
  @PrimaryKey()
  id: string;

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user: User;

  @Property({ nullable: true })
  title?: string | null;

  @Property({ type: 'json', columnType: 'jsonb' })
  status: ThreadStatus;

  @Property({ type: 'json', columnType: 'jsonb' })
  metadata: Record<string, unknown>;

  @Property({ onCreate: () => new Date() })
  createdAt: Date;

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date;

  constructor(params?: {
    id: string;
    user: User;
    title?: string | null;
    status: ThreadStatus;
    metadata: Record<string, unknown>;
    createdAt?: Date;
  }) {
    if (!params) return;

    this.id = params.id;
    this.user = params.user;
    this.title = params.title ?? null;
    this.status = params.status;
    this.metadata = params.metadata;
    if (params.createdAt) this.createdAt = params.createdAt;
  }
}
