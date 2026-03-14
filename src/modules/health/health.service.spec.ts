import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { EntityManager } from '@mikro-orm/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let healthCheckService: { check: jest.Mock };
  let em: { getConnection: jest.Mock };
  let cacheMock: { set: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    healthCheckService = {
      check: jest
        .fn()
        .mockImplementation(
          async (
            indicators: Array<
              () => Promise<
                Record<string, { status: string; message?: string }>
              >
            >,
          ) => {
            const details: Record<
              string,
              { status: string; message?: string }
            > = {};
            for (const indicator of indicators) {
              const result = await indicator();
              Object.assign(details, result);
            }
            const hasDown = Object.values(details).some(
              (v) => v.status === 'down',
            );
            return {
              status: hasDown ? 'error' : 'ok',
              details,
            };
          },
        ),
    };

    em = {
      getConnection: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      }),
    };

    cacheMock = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue('ok'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: EntityManager, useValue: em },
        { provide: CACHE_MANAGER, useValue: cacheMock },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('GetServerHealth', () => {
    it('should return ok status when all indicators are healthy', async () => {
      const result = await service.GetServerHealth();

      expect(result.status).toBe('ok');
      expect(result.details).toEqual(
        expect.objectContaining({
          database: { status: 'up' },
          redis: { status: 'up' },
        }),
      );
    });

    it('should return error status when database is down', async () => {
      em.getConnection.mockReturnValue({
        execute: jest.fn().mockRejectedValue(new Error('Connection refused')),
      });

      const result = await service.GetServerHealth();

      expect(result.status).toBe('error');
      expect(result.details).toEqual(
        expect.objectContaining({
          database: { status: 'down', message: 'Connection refused' },
        }),
      );
    });

    it('should return error status when Redis is down', async () => {
      cacheMock.set.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.GetServerHealth();

      expect(result.status).toBe('error');
      expect(result.details).toEqual(
        expect.objectContaining({
          redis: { status: 'down', message: 'ECONNREFUSED' },
        }),
      );
    });

    it('should return error when Redis read/write mismatch', async () => {
      cacheMock.get.mockResolvedValue(undefined);

      const result = await service.GetServerHealth();

      expect(result.status).toBe('error');
      expect(result.details).toEqual(
        expect.objectContaining({
          redis: { status: 'down', message: 'Redis read/write failed' },
        }),
      );
    });
  });
});
