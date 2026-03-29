import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { AuditProcessor } from './audit.processor';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AuditAction } from './audit-action.enum';
import type { AuditJobMessage } from './dto/audit-job-message.dto';
import type { Job } from 'bullmq';

describe('AuditProcessor', () => {
  let processor: AuditProcessor;
  let mockFork: { create: jest.Mock; flush: jest.Mock };
  let mockEm: { fork: jest.Mock };

  beforeEach(async () => {
    mockFork = {
      create: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    mockEm = { fork: jest.fn().mockReturnValue(mockFork) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditProcessor, { provide: EntityManager, useValue: mockEm }],
    }).compile();

    processor = module.get<AuditProcessor>(AuditProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should persist an AuditLog entity with correct fields', async () => {
    const jobData: AuditJobMessage = {
      action: AuditAction.AUTH_LOGIN_SUCCESS,
      actorId: 'user-1',
      actorUsername: 'admin',
      resourceType: 'User',
      resourceId: 'user-1',
      metadata: { strategyUsed: 'LocalLoginStrategy' },
      browserName: 'Chrome',
      os: 'Linux',
      ipAddress: '127.0.0.1',
      occurredAt: '2026-03-29T12:00:00.000Z',
    };

    const mockJob = { data: jobData } as Job<AuditJobMessage>;

    await processor.process(mockJob);

    expect(mockEm.fork).toHaveBeenCalled();
    expect(mockFork.create).toHaveBeenCalledWith(AuditLog, {
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
    });
    expect(mockFork.flush).toHaveBeenCalled();
  });

  it('should fork the entity manager for each job', async () => {
    const jobData: AuditJobMessage = {
      action: AuditAction.AUTH_LOGOUT,
      occurredAt: new Date().toISOString(),
    };

    await processor.process({ data: jobData } as Job<AuditJobMessage>);
    await processor.process({ data: jobData } as Job<AuditJobMessage>);

    expect(mockEm.fork).toHaveBeenCalledTimes(2);
  });

  it('should handle job with minimal fields', async () => {
    const jobData: AuditJobMessage = {
      action: AuditAction.AUTH_LOGOUT,
      occurredAt: '2026-03-29T12:00:00.000Z',
    };

    await processor.process({ data: jobData } as Job<AuditJobMessage>);

    expect(mockFork.create).toHaveBeenCalledWith(AuditLog, {
      action: AuditAction.AUTH_LOGOUT,
      actorId: undefined,
      actorUsername: undefined,
      resourceType: undefined,
      resourceId: undefined,
      metadata: undefined,
      browserName: undefined,
      os: undefined,
      ipAddress: undefined,
      occurredAt: new Date('2026-03-29T12:00:00.000Z'),
    });
  });

  describe('onFailed', () => {
    it('should log non-PII fields on failure', () => {
      const logSpy = jest.spyOn(processor['logger'], 'error');
      const jobData: AuditJobMessage = {
        action: AuditAction.AUTH_LOGIN_FAILURE,
        actorId: 'user-1',
        resourceType: 'User',
        resourceId: 'user-1',
        metadata: { username: 'sensitive-data' },
        occurredAt: '2026-03-29T12:00:00.000Z',
      };

      processor.onFailed(
        { id: 'job-1', data: jobData, attemptsMade: 1 } as Job<AuditJobMessage>,
        new Error('DB connection lost'),
      );

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logMessage = logSpy.mock.calls[0][0] as string;
      expect(logMessage).toContain('action=auth.login.failure');
      expect(logMessage).toContain('actorId=user-1');
      expect(logMessage).toContain('DB connection lost');
      expect(logMessage).not.toContain('sensitive-data');
    });
  });
});
