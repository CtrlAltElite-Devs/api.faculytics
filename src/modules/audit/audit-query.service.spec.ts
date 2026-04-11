import { NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AuditQueryService } from './audit-query.service';
import { AuditAction } from './audit-action.enum';

describe('AuditQueryService', () => {
  let service: AuditQueryService;
  let em: {
    findAndCount: jest.Mock;
    findOneOrFail: jest.Mock;
  };

  const sampleLog = {
    id: 'log-1',
    action: AuditAction.AUTH_LOGIN_SUCCESS,
    actorId: 'user-1',
    actorUsername: 'admin',
    resourceType: 'User',
    resourceId: 'user-1',
    metadata: { strategyUsed: 'LocalLoginStrategy' },
    browserName: 'Chrome',
    os: 'Linux',
    ipAddress: '127.0.0.1',
    occurredAt: new Date('2026-03-29T12:00:00.000Z'),
  } as AuditLog;

  beforeEach(async () => {
    em = {
      findAndCount: jest.fn().mockResolvedValue([[sampleLog], 1]),
      findOneOrFail: jest.fn().mockResolvedValue(sampleLog),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditQueryService, { provide: EntityManager, useValue: em }],
    }).compile();

    service = module.get(AuditQueryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ListAuditLogs', () => {
    it('should return paginated results with correct meta', async () => {
      const result = await service.ListAuditLogs({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('log-1');
      expect(result.data[0].action).toBe(AuditAction.AUTH_LOGIN_SUCCESS);
      expect(result.meta).toEqual({
        totalItems: 1,
        itemCount: 1,
        itemsPerPage: 10,
        totalPages: 1,
        currentPage: 1,
      });
    });

    it('should pass softDelete: false filter', async () => {
      await service.ListAuditLogs({});

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.any(Object),
        expect.objectContaining({
          filters: { softDelete: false },
        }),
      );
    });

    it('should order by occurredAt DESC, id DESC', async () => {
      await service.ListAuditLogs({});

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.any(Object),
        expect.objectContaining({
          orderBy: { occurredAt: 'DESC', id: 'DESC' },
        }),
      );
    });

    it('should compute correct offset for pagination', async () => {
      await service.ListAuditLogs({ page: 3, limit: 15 });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.any(Object),
        expect.objectContaining({
          limit: 15,
          offset: 30,
        }),
      );
    });

    it('should apply exact match filter for action', async () => {
      await service.ListAuditLogs({
        action: AuditAction.AUTH_LOGIN_SUCCESS,
      });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.AUTH_LOGIN_SUCCESS,
        }),
        expect.any(Object),
      );
    });

    it('should apply exact match filter for actorId', async () => {
      await service.ListAuditLogs({ actorId: 'user-1' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({ actorId: 'user-1' }),
        expect.any(Object),
      );
    });

    it('should apply ILIKE partial match for actorUsername', async () => {
      await service.ListAuditLogs({ actorUsername: 'john' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          actorUsername: { $ilike: '%john%' },
        }),
        expect.any(Object),
      );
    });

    it('should apply exact match filter for resourceType', async () => {
      await service.ListAuditLogs({ resourceType: 'User' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({ resourceType: 'User' }),
        expect.any(Object),
      );
    });

    it('should apply exact match filter for resourceId', async () => {
      await service.ListAuditLogs({ resourceId: 'res-1' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({ resourceId: 'res-1' }),
        expect.any(Object),
      );
    });

    it('should apply date range filter with from only', async () => {
      await service.ListAuditLogs({ from: '2026-01-01T00:00:00.000Z' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          occurredAt: { $gte: new Date('2026-01-01T00:00:00.000Z') },
        }),
        expect.any(Object),
      );
    });

    it('should apply date range filter with to only', async () => {
      await service.ListAuditLogs({ to: '2026-12-31T23:59:59.999Z' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          occurredAt: { $lte: new Date('2026-12-31T23:59:59.999Z') },
        }),
        expect.any(Object),
      );
    });

    it('should apply date range filter with both from and to', async () => {
      await service.ListAuditLogs({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.999Z',
      });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          occurredAt: {
            $gte: new Date('2026-01-01T00:00:00.000Z'),
            $lte: new Date('2026-12-31T23:59:59.999Z'),
          },
        }),
        expect.any(Object),
      );
    });

    it('should apply general text search across multiple fields', async () => {
      await service.ListAuditLogs({ search: 'login' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          $or: [
            { actorUsername: { $ilike: '%login%' } },
            { action: { $ilike: '%login%' } },
            { resourceType: { $ilike: '%login%' } },
          ],
        }),
        expect.any(Object),
      );
    });

    it('should escape LIKE special characters in actorUsername', async () => {
      await service.ListAuditLogs({ actorUsername: '100%_done' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          actorUsername: { $ilike: '%100\\%\\_done%' },
        }),
        expect.any(Object),
      );
    });

    it('should escape LIKE special characters in search', async () => {
      await service.ListAuditLogs({ search: '50%' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          $or: [
            { actorUsername: { $ilike: '%50\\%%' } },
            { action: { $ilike: '%50\\%%' } },
            { resourceType: { $ilike: '%50\\%%' } },
          ],
        }),
        expect.any(Object),
      );
    });

    it('should return empty data and zero meta when no results', async () => {
      em.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.ListAuditLogs({});

      expect(result).toEqual({
        data: [],
        meta: {
          totalItems: 0,
          itemCount: 0,
          itemsPerPage: 10,
          totalPages: 0,
          currentPage: 1,
        },
      });
    });

    it('should combine multiple filters', async () => {
      await service.ListAuditLogs({
        action: AuditAction.AUTH_LOGIN_SUCCESS,
        actorId: 'user-1',
        resourceType: 'User',
      });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        {
          action: AuditAction.AUTH_LOGIN_SUCCESS,
          actorId: 'user-1',
          resourceType: 'User',
        },
        expect.any(Object),
      );
    });

    it('should trim actorUsername before searching', async () => {
      await service.ListAuditLogs({ actorUsername: '  john  ' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          actorUsername: { $ilike: '%john%' },
        }),
        expect.any(Object),
      );
    });

    it('should trim search before searching', async () => {
      await service.ListAuditLogs({ search: '  login  ' });

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          $or: [
            { actorUsername: { $ilike: '%login%' } },
            { action: { $ilike: '%login%' } },
            { resourceType: { $ilike: '%login%' } },
          ],
        }),
        expect.any(Object),
      );
    });

    it('should use default page 1 and limit 10 when not specified', async () => {
      await service.ListAuditLogs({});

      expect(em.findAndCount).toHaveBeenCalledWith(
        AuditLog,
        expect.any(Object),
        expect.objectContaining({
          offset: 0,
          limit: 10,
        }),
      );
    });
  });

  describe('GetAuditLog', () => {
    it('should return a mapped audit log detail', async () => {
      const result = await service.GetAuditLog('log-1');

      expect(result.id).toBe('log-1');
      expect(result.action).toBe(AuditAction.AUTH_LOGIN_SUCCESS);
      expect(result.actorId).toBe('user-1');
      expect(result.actorUsername).toBe('admin');
      expect(result.metadata).toEqual({
        strategyUsed: 'LocalLoginStrategy',
      });
      expect(result.occurredAt).toEqual(new Date('2026-03-29T12:00:00.000Z'));
    });

    it('should pass softDelete: false filter to findOneOrFail', async () => {
      await service.GetAuditLog('log-1');

      expect(em.findOneOrFail).toHaveBeenCalledWith(
        AuditLog,
        { id: 'log-1' },
        expect.objectContaining({
          filters: { softDelete: false },
        }),
      );
    });

    it('should throw NotFoundException when audit log does not exist', async () => {
      em.findOneOrFail.mockImplementation(
        (
          _entity: unknown,
          _where: unknown,
          opts: { failHandler: () => Error },
        ) => {
          throw opts.failHandler();
        },
      );

      await expect(service.GetAuditLog('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
