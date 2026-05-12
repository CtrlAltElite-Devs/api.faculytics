import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { ErrorCaptureFilter } from './error-capture.filter';
import { ErrorLogService } from '../error-log.service';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import type { EmitErrorParams } from '../dto/emit-error-params.dto';

describe('ErrorCaptureFilter', () => {
  let filter: ErrorCaptureFilter;
  let errorLogService: { Emit: jest.Mock };
  let requestMetadataService: { get: jest.Mock };
  let currentUserService: { get: jest.Mock };
  let httpAdapterHost: HttpAdapterHost;
  // Spy on super.catch to skip BaseExceptionFilter's response-writing logic —
  // we're testing the capture path, not the wire-response path.
  let superCatchSpy: jest.SpyInstance;

  const buildHost = (
    request: Record<string, unknown>,
    type: 'http' | 'rpc' = 'http',
  ): ArgumentsHost =>
    ({
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({}) as never,
      switchToWs: () => ({}) as never,
    }) as unknown as ArgumentsHost;

  beforeEach(() => {
    errorLogService = { Emit: jest.fn().mockResolvedValue(undefined) };
    requestMetadataService = {
      get: jest.fn().mockReturnValue({
        browserName: 'Chrome',
        os: 'Linux',
        ipAddress: '127.0.0.1',
      }),
    };
    currentUserService = {
      get: jest.fn().mockReturnValue({ id: 'u1', userName: 'tester' }),
    };
    httpAdapterHost = {
      httpAdapter: {},
    } as unknown as HttpAdapterHost;

    superCatchSpy = jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);

    filter = new ErrorCaptureFilter(
      httpAdapterHost,
      errorLogService as unknown as ErrorLogService,
      requestMetadataService as unknown as RequestMetadataService,
      currentUserService as unknown as CurrentUserService,
    );
  });

  afterEach(() => {
    superCatchSpy.mockRestore();
  });

  it('captures unhandled 500-equivalent errors with sanitized request body', () => {
    const host = buildHost({
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      body: { username: 'ucmn-t-67092', password: 'Password789#' },
      query: {},
    });

    filter.catch(new TypeError('Cannot read properties of null'), host);

    expect(errorLogService.Emit).toHaveBeenCalledTimes(1);
    const params = (
      errorLogService.Emit.mock.calls as EmitErrorParams[][]
    )[0][0];
    expect(params.statusCode).toBe(500);
    expect(params.method).toBe('POST');
    expect(params.path).toBe('/api/v1/auth/login');
    expect(params.errorName).toBe('TypeError');
    expect(params.message).toBe('Cannot read properties of null');
    expect(params.userId).toBe('u1');
    expect(params.userName).toBe('tester');
    expect(params.requestBody).toEqual({
      username: 'ucmn-t-67092',
      password: '[REDACTED]',
    });
    expect(params.browserName).toBe('Chrome');
  });

  it('captures explicit 5xx HttpExceptions', () => {
    const host = buildHost({
      method: 'GET',
      originalUrl: '/api/v1/foo',
      body: {},
      query: {},
    });

    filter.catch(
      new HttpException('boom', HttpStatus.SERVICE_UNAVAILABLE),
      host,
    );

    expect(errorLogService.Emit).toHaveBeenCalledTimes(1);
    const params = (
      errorLogService.Emit.mock.calls as EmitErrorParams[][]
    )[0][0];
    expect(params.statusCode).toBe(503);
  });

  it('does NOT capture 4xx HttpExceptions', () => {
    const host = buildHost({
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      body: { username: 'x', password: 'y' },
      query: {},
    });

    filter.catch(
      new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED),
      host,
    );

    expect(errorLogService.Emit).not.toHaveBeenCalled();
  });

  it('does NOT capture for non-http hosts (e.g. BullMQ worker errors)', () => {
    const host = buildHost({ method: 'POST', originalUrl: '/' }, 'rpc');

    filter.catch(new Error('worker failure'), host);

    expect(errorLogService.Emit).not.toHaveBeenCalled();
  });

  it('swallows capture failures so the response is never blocked', () => {
    errorLogService.Emit.mockImplementation(() => {
      throw new Error('queue down');
    });
    const host = buildHost({
      method: 'POST',
      originalUrl: '/api/v1/foo',
      body: {},
      query: {},
    });

    expect(() => filter.catch(new Error('original'), host)).not.toThrow();
  });
});
