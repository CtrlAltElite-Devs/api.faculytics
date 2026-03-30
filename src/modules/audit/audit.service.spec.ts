import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import { AuditService } from './audit.service';
import { AuditAction } from './audit-action.enum';

describe('AuditService', () => {
  let service: AuditService;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getQueueToken(QueueName.AUDIT), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should enqueue an audit event with correct envelope', async () => {
    await service.Emit({
      action: AuditAction.AUTH_LOGIN_SUCCESS,
      actorId: 'user-1',
      actorUsername: 'admin',
      metadata: { strategyUsed: 'LocalLoginStrategy' },
      browserName: 'Chrome',
      os: 'Linux',
      ipAddress: '127.0.0.1',
    });

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    const [name, envelope, opts] = mockQueue.add.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(name).toBe('audit');
    expect(envelope.action).toBe(AuditAction.AUTH_LOGIN_SUCCESS);
    expect(envelope.actorId).toBe('user-1');
    expect(envelope.actorUsername).toBe('admin');
    expect(envelope.metadata).toEqual({
      strategyUsed: 'LocalLoginStrategy',
    });
    expect(envelope.occurredAt).toBeDefined();
    expect(opts).toEqual({
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  });

  it('should catch and log Redis errors without throwing', async () => {
    mockQueue.add.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.Emit({
        action: AuditAction.AUTH_LOGOUT,
        actorId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('should pass optional fields as undefined when not provided', async () => {
    await service.Emit({ action: AuditAction.AUTH_LOGOUT });

    const [, envelope] = mockQueue.add.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(envelope.actorId).toBeUndefined();
    expect(envelope.actorUsername).toBeUndefined();
    expect(envelope.resourceType).toBeUndefined();
    expect(envelope.resourceId).toBeUndefined();
  });
});
