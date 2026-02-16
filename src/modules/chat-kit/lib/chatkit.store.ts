import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  Attachment,
  Page,
  Store,
  StoreNotFoundError,
  ThreadItem,
  ThreadMetadata,
} from 'chatkit-node-backend-sdk';
import { ChatKitThread } from '../../../entities/chatkit-thread.entity';
import { ChatKitThreadItem } from '../../../entities/chatkit-thread-item.entity';
import { User } from '../../../entities/user.entity';
import { ChatKitContext } from './chatkit.types';

@Injectable()
export class ChatKitStore extends Store<ChatKitContext> {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async loadThread(
    threadId: string,
    context: ChatKitContext,
  ): Promise<ThreadMetadata> {
    const thread = await this.em.findOne(ChatKitThread, {
      id: threadId,
      user: context.userId,
    });

    if (!thread) throw new StoreNotFoundError(`Thread not found: ${threadId}`);

    return this.toThreadMetadata(thread);
  }

  async saveThread(
    thread: ThreadMetadata,
    context: ChatKitContext,
  ): Promise<void> {
    const user = await this.em.findOne(User, context.userId);
    if (!user)
      throw new StoreNotFoundError(`User not found: ${context.userId}`);

    const existing = await this.em.findOne(ChatKitThread, {
      id: thread.id,
      user: context.userId,
    });

    const createdAt = this.parseDate(thread.created_at);

    if (existing) {
      existing.title = thread.title ?? null;
      existing.status = thread.status;
      existing.metadata = thread.metadata ?? {};
      existing.createdAt = createdAt;
      this.em.persist(existing);
      await this.em.flush();
      return;
    }

    const entity = new ChatKitThread({
      id: thread.id,
      user,
      title: thread.title ?? null,
      status: thread.status,
      metadata: thread.metadata ?? {},
      createdAt,
    });

    this.em.persist(entity);
    await this.em.flush();
  }

  async deleteThread(threadId: string, context: ChatKitContext): Promise<void> {
    const thread = await this.em.findOne(ChatKitThread, {
      id: threadId,
      user: context.userId,
    });

    if (!thread) throw new StoreNotFoundError(`Thread not found: ${threadId}`);

    await this.em.nativeDelete(ChatKitThreadItem, { thread: thread.id });
    await this.em.nativeDelete(ChatKitThread, { id: thread.id });
  }

  async loadThreads(
    limit: number,
    after: string | null,
    order: 'asc' | 'desc',
    context: ChatKitContext,
  ): Promise<Page<ThreadMetadata>> {
    const qb = this.em
      .createQueryBuilder(ChatKitThread, 't')
      .where({ user: context.userId })
      .orderBy({ createdAt: order, id: order })
      .limit(limit + 1);

    if (after) {
      const cursor = await this.em.findOne(ChatKitThread, {
        id: after,
        user: context.userId,
      });

      if (!cursor) throw new StoreNotFoundError(`Thread not found: ${after}`);

      if (order === 'asc') {
        qb.andWhere('(t.created_at > ? OR (t.created_at = ? AND t.id > ?))', [
          cursor.createdAt,
          cursor.createdAt,
          cursor.id,
        ]);
      } else {
        qb.andWhere('(t.created_at < ? OR (t.created_at = ? AND t.id < ?))', [
          cursor.createdAt,
          cursor.createdAt,
          cursor.id,
        ]);
      }
    }

    const rows = await qb.getResult();
    const has_more = rows.length > limit;
    const data = rows
      .slice(0, limit)
      .map((thread) => this.toThreadMetadata(thread));
    const afterCursor = data.length ? data[data.length - 1].id : null;

    return { data, has_more, after: afterCursor };
  }

  async loadThreadItems(
    threadId: string,
    after: string | null,
    limit: number,
    order: 'asc' | 'desc',
    context: ChatKitContext,
  ): Promise<Page<ThreadItem>> {
    const thread = await this.em.findOne(ChatKitThread, {
      id: threadId,
      user: context.userId,
    });

    if (!thread) throw new StoreNotFoundError(`Thread not found: ${threadId}`);

    const qb = this.em
      .createQueryBuilder(ChatKitThreadItem, 'i')
      .where({ thread: thread.id })
      .orderBy({ createdAt: order, id: order })
      .limit(limit + 1);

    if (after) {
      const cursor = await this.em.findOne(ChatKitThreadItem, {
        id: after,
        thread: thread.id,
      });

      if (!cursor) throw new StoreNotFoundError(`Item not found: ${after}`);

      if (order === 'asc') {
        qb.andWhere('(i.created_at > ? OR (i.created_at = ? AND i.id > ?))', [
          cursor.createdAt,
          cursor.createdAt,
          cursor.id,
        ]);
      } else {
        qb.andWhere('(i.created_at < ? OR (i.created_at = ? AND i.id < ?))', [
          cursor.createdAt,
          cursor.createdAt,
          cursor.id,
        ]);
      }
    }

    const rows = await qb.getResult();
    const has_more = rows.length > limit;
    const data = rows.slice(0, limit).map((item) => item.payload);
    const afterCursor = data.length ? data[data.length - 1].id : null;

    return { data, has_more, after: afterCursor };
  }

  async addThreadItem(
    threadId: string,
    item: ThreadItem,
    context: ChatKitContext,
  ): Promise<void> {
    const thread = await this.em.findOne(ChatKitThread, {
      id: threadId,
      user: context.userId,
    });

    if (!thread) throw new StoreNotFoundError(`Thread not found: ${threadId}`);

    const entity = new ChatKitThreadItem({
      id: item.id,
      thread,
      type: item.type,
      payload: item,
      createdAt: this.parseDate(item.created_at),
    });

    this.em.persist(entity);
    await this.em.flush();
  }

  async saveItem(
    threadId: string,
    item: ThreadItem,
    context: ChatKitContext,
  ): Promise<void> {
    const thread = await this.em.findOne(ChatKitThread, {
      id: threadId,
      user: context.userId,
    });

    if (!thread) throw new StoreNotFoundError(`Thread not found: ${threadId}`);

    const existing = await this.em.findOne(ChatKitThreadItem, {
      id: item.id,
      thread: thread.id,
    });

    if (!existing) throw new StoreNotFoundError(`Item not found: ${item.id}`);

    existing.type = item.type;
    existing.payload = item;
    const createdAt = new Date(item.created_at);
    if (!Number.isNaN(createdAt.getTime())) {
      existing.createdAt = createdAt;
    }

    this.em.persist(existing);
    await this.em.flush();
  }

  async loadItem(
    threadId: string,
    itemId: string,
    context: ChatKitContext,
  ): Promise<ThreadItem> {
    const thread = await this.em.findOne(ChatKitThread, {
      id: threadId,
      user: context.userId,
    });

    if (!thread) throw new StoreNotFoundError(`Thread not found: ${threadId}`);

    const item = await this.em.findOne(ChatKitThreadItem, {
      id: itemId,
      thread: thread.id,
    });

    if (!item) throw new StoreNotFoundError(`Item not found: ${itemId}`);

    return item.payload;
  }

  async deleteThreadItem(
    threadId: string,
    itemId: string,
    context: ChatKitContext,
  ): Promise<void> {
    const thread = await this.em.findOne(ChatKitThread, {
      id: threadId,
      user: context.userId,
    });

    if (!thread) throw new StoreNotFoundError(`Thread not found: ${threadId}`);

    const deleted = await this.em.nativeDelete(ChatKitThreadItem, {
      id: itemId,
      thread: thread.id,
    });

    if (!deleted) throw new StoreNotFoundError(`Item not found: ${itemId}`);
  }

  saveAttachment(
    _attachment: Attachment,
    _context: ChatKitContext,
  ): Promise<void> {
    void _attachment;
    void _context;
    throw new Error('Attachments are disabled');
  }

  loadAttachment(
    _attachmentId: string,
    _context: ChatKitContext,
  ): Promise<Attachment> {
    void _attachmentId;
    void _context;
    throw new Error('Attachments are disabled');
  }

  deleteAttachment(
    _attachmentId: string,
    _context: ChatKitContext,
  ): Promise<void> {
    void _attachmentId;
    void _context;
    throw new Error('Attachments are disabled');
  }

  private toThreadMetadata(thread: ChatKitThread): ThreadMetadata {
    return {
      id: thread.id,
      title: thread.title ?? null,
      created_at: thread.createdAt.toISOString(),
      status: thread.status,
      metadata: thread.metadata ?? {},
    };
  }

  private parseDate(value: string): Date {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return new Date();
  }
}
