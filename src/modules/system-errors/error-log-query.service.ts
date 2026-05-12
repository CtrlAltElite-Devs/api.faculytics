import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { FilterQuery } from '@mikro-orm/core';
import { ErrorLog } from 'src/entities/error-log.entity';
import { CurrentUserService } from '../common/cls/current-user.service';
import { ListErrorLogsQueryDto } from './dto/requests/list-error-logs-query.dto';
import { ErrorLogItemResponseDto } from './dto/responses/error-log-item.response.dto';
import { ErrorLogListResponseDto } from './dto/responses/error-log-list.response.dto';
import { ErrorLogDetailResponseDto } from './dto/responses/error-log-detail.response.dto';

@Injectable()
export class ErrorLogQueryService {
  constructor(
    private readonly em: EntityManager,
    private readonly currentUserService: CurrentUserService,
  ) {}

  async ListErrorLogs(
    query: ListErrorLogsQueryDto,
  ): Promise<ErrorLogListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const [logs, totalItems] = await this.em.findAndCount(
      ErrorLog,
      this.BuildFilter(query),
      {
        limit,
        offset,
        orderBy: { occurredAt: 'DESC', id: 'DESC' },
        filters: { softDelete: false },
      },
    );

    return {
      data: logs.map((log) => ErrorLogItemResponseDto.Map(log)),
      meta: {
        totalItems,
        itemCount: logs.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async GetErrorLog(id: string): Promise<ErrorLogDetailResponseDto> {
    const log = await this.em.findOneOrFail(
      ErrorLog,
      { id },
      {
        filters: { softDelete: false },
        failHandler: () => new NotFoundException('Error log not found'),
      },
    );

    return ErrorLogDetailResponseDto.Map(log);
  }

  async Acknowledge(id: string): Promise<ErrorLogDetailResponseDto> {
    const log = await this.em.findOneOrFail(
      ErrorLog,
      { id },
      {
        filters: { softDelete: false },
        failHandler: () => new NotFoundException('Error log not found'),
      },
    );

    if (!log.acknowledgedAt) {
      const actor = this.currentUserService.get();
      log.acknowledgedAt = new Date();
      log.acknowledgedBy = actor?.userName ?? actor?.id ?? 'unknown';
      await this.em.flush();
    }

    return ErrorLogDetailResponseDto.Map(log);
  }

  async Unacknowledge(id: string): Promise<ErrorLogDetailResponseDto> {
    const log = await this.em.findOneOrFail(
      ErrorLog,
      { id },
      {
        filters: { softDelete: false },
        failHandler: () => new NotFoundException('Error log not found'),
      },
    );

    if (log.acknowledgedAt) {
      log.acknowledgedAt = undefined;
      log.acknowledgedBy = undefined;
      await this.em.flush();
    }

    return ErrorLogDetailResponseDto.Map(log);
  }

  private BuildFilter(query: ListErrorLogsQueryDto): FilterQuery<ErrorLog> {
    const filter: FilterQuery<ErrorLog> = {};

    if (query.statusCode !== undefined) {
      filter.statusCode = query.statusCode;
    }

    if (query.method) {
      filter.method = query.method.toUpperCase();
    }

    if (query.errorName) {
      filter.errorName = query.errorName;
    }

    if (query.pathSearch) {
      filter.path = {
        $ilike: `%${this.EscapeLikePattern(query.pathSearch.trim())}%`,
      };
    }

    if (query.userName) {
      filter.userName = {
        $ilike: `%${this.EscapeLikePattern(query.userName.trim())}%`,
      };
    }

    if (query.acknowledged === true) {
      filter.acknowledgedAt = { $ne: null } as never;
    } else if (query.acknowledged === false) {
      filter.acknowledgedAt = null as never;
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
        { path: { $ilike: search } },
        { errorName: { $ilike: search } },
        { message: { $ilike: search } },
        { userName: { $ilike: search } },
      ];
    }

    return filter;
  }

  private EscapeLikePattern(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }
}
