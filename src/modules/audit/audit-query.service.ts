import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { FilterQuery } from '@mikro-orm/core';
import { AuditLog } from 'src/entities/audit-log.entity';
import { ListAuditLogsQueryDto } from './dto/requests/list-audit-logs-query.dto';
import { AuditLogItemResponseDto } from './dto/responses/audit-log-item.response.dto';
import { AuditLogListResponseDto } from './dto/responses/audit-log-list.response.dto';
import { AuditLogDetailResponseDto } from './dto/responses/audit-log-detail.response.dto';

@Injectable()
export class AuditQueryService {
  constructor(private readonly em: EntityManager) {}

  async ListAuditLogs(
    query: ListAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const [logs, totalItems] = await this.em.findAndCount(
      AuditLog,
      this.BuildFilter(query),
      {
        limit,
        offset,
        orderBy: { occurredAt: 'DESC', id: 'DESC' },
        filters: { softDelete: false },
      },
    );

    return {
      data: logs.map((log) => AuditLogItemResponseDto.Map(log)),
      meta: {
        totalItems,
        itemCount: logs.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async GetAuditLog(id: string): Promise<AuditLogDetailResponseDto> {
    const log = await this.em.findOneOrFail(
      AuditLog,
      { id },
      {
        filters: { softDelete: false },
        failHandler: () => new NotFoundException('Audit log not found'),
      },
    );

    return AuditLogDetailResponseDto.Map(log);
  }

  private BuildFilter(query: ListAuditLogsQueryDto): FilterQuery<AuditLog> {
    const filter: FilterQuery<AuditLog> = {};

    if (query.action) {
      filter.action = query.action;
    }

    if (query.actorId) {
      filter.actorId = query.actorId;
    }

    if (query.actorUsername) {
      filter.actorUsername = {
        $ilike: `%${this.EscapeLikePattern(query.actorUsername.trim())}%`,
      };
    }

    if (query.resourceType) {
      filter.resourceType = query.resourceType;
    }

    if (query.resourceId) {
      filter.resourceId = query.resourceId;
    }

    if (query.from || query.to) {
      const occurredAtFilter: Record<string, Date> = {};
      if (query.from) occurredAtFilter.$gte = new Date(query.from);
      if (query.to) occurredAtFilter.$lte = new Date(query.to);
      filter.occurredAt = occurredAtFilter as never;
    }

    if (query.search) {
      const search = `%${this.EscapeLikePattern(query.search.trim())}%`;
      filter.$or = [
        { actorUsername: { $ilike: search } },
        { action: { $ilike: search } },
        { resourceType: { $ilike: search } },
      ];
    }

    return filter;
  }

  private EscapeLikePattern(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }
}
