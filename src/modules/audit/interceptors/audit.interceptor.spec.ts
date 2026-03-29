import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from '../audit.service';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import { AuditAction } from '../audit-action.enum';
import { AUDIT_META_KEY } from '../decorators/audited.decorator';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: jest.Mocked<Reflector>;
  let auditService: { Emit: jest.Mock };
  let currentUserService: { get: jest.Mock };
  let requestMetadataService: { get: jest.Mock };

  const mockHandler = (): jest.Mocked<CallHandler> => ({
    handle: jest.fn().mockReturnValue(of({ success: true })),
  });

  const mockContext = (
    params: Record<string, string> = {},
    query: Record<string, unknown> = {},
    user?: { userId: string },
  ): jest.Mocked<ExecutionContext> =>
    ({
      getHandler: jest.fn().mockReturnValue(() => {}),
      getClass: jest.fn().mockReturnValue({ name: 'TestController' }),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          params,
          query,
          user,
        }),
      }),
    }) as unknown as jest.Mocked<ExecutionContext>;

  beforeEach(() => {
    reflector = { get: jest.fn() } as unknown as jest.Mocked<Reflector>;
    auditService = { Emit: jest.fn().mockResolvedValue(undefined) };
    currentUserService = { get: jest.fn().mockReturnValue(null) };
    requestMetadataService = {
      get: jest.fn().mockReturnValue({
        browserName: 'Chrome',
        os: 'Linux',
        ipAddress: '127.0.0.1',
      }),
    };

    interceptor = new AuditInterceptor(
      reflector,
      auditService as unknown as AuditService,
      currentUserService as unknown as CurrentUserService,
      requestMetadataService as unknown as RequestMetadataService,
    );
  });

  it('should pass through when no @Audited() metadata', (done) => {
    reflector.get.mockReturnValue(undefined);
    const handler = mockHandler();
    const context = mockContext();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(auditService.Emit).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should emit audit event after successful response', (done) => {
    reflector.get.mockReturnValue({
      action: AuditAction.AUTH_LOGOUT,
      resource: 'User',
    });
    currentUserService.get.mockReturnValue({
      id: 'user-1',
      userName: 'admin',
    });

    const handler = mockHandler();
    const context = mockContext({}, {}, { userId: 'user-1' });

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(auditService.Emit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: AuditAction.AUTH_LOGOUT,
            actorId: 'user-1',
            actorUsername: 'admin',
            resourceType: 'User',
            browserName: 'Chrome',
            os: 'Linux',
            ipAddress: '127.0.0.1',
          }),
        );
        done();
      },
    });
  });

  it('should extract UUID resourceId from route params', (done) => {
    reflector.get.mockReturnValue({
      action: AuditAction.ANALYSIS_PIPELINE_CONFIRM,
      resource: 'AnalysisPipeline',
    });

    const pipelineId = '550e8400-e29b-41d4-a716-446655440000';
    const handler = mockHandler();
    const context = mockContext({ id: pipelineId }, {}, { userId: 'user-1' });

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(auditService.Emit).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceId: pipelineId,
            resourceType: 'AnalysisPipeline',
          }),
        );
        done();
      },
    });
  });

  it('should fall back to req.user.userId when CLS user is null', (done) => {
    reflector.get.mockReturnValue({
      action: AuditAction.AUTH_LOGOUT,
      resource: 'User',
    });
    currentUserService.get.mockReturnValue(null);

    const handler = mockHandler();
    const context = mockContext({}, {}, { userId: 'jwt-user-id' });

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(auditService.Emit).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: 'jwt-user-id',
            actorUsername: undefined,
          }),
        );
        done();
      },
    });
  });

  it('should not emit on error responses (tap, not finalize)', (done) => {
    reflector.get.mockReturnValue({
      action: AuditAction.AUTH_LOGOUT,
      resource: 'User',
    });

    const handler: jest.Mocked<CallHandler> = {
      handle: jest.fn().mockReturnValue(throwError(() => new Error('fail'))),
    };
    const context = mockContext();

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(auditService.Emit).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should not propagate errors from AuditService.Emit()', (done) => {
    reflector.get.mockReturnValue({
      action: AuditAction.AUTH_LOGOUT,
      resource: 'User',
    });
    auditService.Emit.mockRejectedValue(new Error('Redis down'));

    const handler = mockHandler();
    const context = mockContext({}, {}, { userId: 'user-1' });

    interceptor.intercept(context, handler).subscribe({
      next: (value) => {
        expect(value).toEqual({ success: true });
      },
      complete: () => {
        done();
      },
    });
  });

  it('should capture route params and query in metadata', (done) => {
    reflector.get.mockReturnValue({
      action: AuditAction.QUESTIONNAIRE_SUBMISSIONS_WIPE,
      resource: 'QuestionnaireVersion',
    });

    const versionId = '550e8400-e29b-41d4-a716-446655440000';
    const handler = mockHandler();
    const context = mockContext(
      { versionId },
      { dryRun: 'true' },
      { userId: 'user-1' },
    );

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(auditService.Emit).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: { versionId, dryRun: 'true' },
            resourceId: versionId,
          }),
        );
        done();
      },
    });
  });

  it('should set metadata to undefined when params and query are empty', (done) => {
    reflector.get.mockReturnValue({
      action: AuditAction.AUTH_LOGOUT,
      resource: 'User',
    });

    const handler = mockHandler();
    const context = mockContext({}, {}, { userId: 'user-1' });

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(auditService.Emit).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: undefined,
          }),
        );
        done();
      },
    });
  });

  it('should read metadata from Reflector with AUDIT_META_KEY', () => {
    reflector.get.mockReturnValue(undefined);
    const handler = mockHandler();
    const context = mockContext();

    interceptor.intercept(context, handler);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(reflector.get).toHaveBeenCalledWith(
      AUDIT_META_KEY,
      context.getHandler(),
    );
  });
});
