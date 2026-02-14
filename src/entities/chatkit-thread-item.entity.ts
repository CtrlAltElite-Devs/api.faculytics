import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import type { ThreadItem } from 'chatkit-node-backend-sdk';
import { ChatKitThread } from './chatkit-thread.entity';

@Entity({ tableName: 'chatkit_thread_item' })
@Index({ properties: ['thread', 'createdAt'] })
export class ChatKitThreadItem {
  @PrimaryKey()
  id: string;

  @ManyToOne(() => ChatKitThread, { fieldName: 'thread_id' })
  thread: ChatKitThread;

  @Property()
  type: string;

  @Property({ type: 'json', columnType: 'jsonb' })
  payload: ThreadItem;

  @Property({ onCreate: () => new Date() })
  createdAt: Date;

  constructor(params?: {
    id: string;
    thread: ChatKitThread;
    type: string;
    payload: ThreadItem;
    createdAt?: Date;
  }) {
    if (!params) return;

    this.id = params.id;
    this.thread = params.thread;
    this.type = params.type;
    this.payload = params.payload;
    if (params.createdAt) this.createdAt = params.createdAt;
  }
}
