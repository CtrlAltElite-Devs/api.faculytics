import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { Request } from 'express';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { ErrorLogService } from '../error-log.service';
import { sanitizeRequestPayload } from '../lib/sanitize-request';

/**
 * Global exception filter that persists every unhandled 5xx into `error_log`
 * for admin diagnostics, then defers to NestJS's BaseExceptionFilter so the
 * wire response (status, body) is byte-identical to today's behaviour.
 *
 * Skips:
 * - 4xx HttpExceptions (validation, auth, not-found — these are user-driven)
 * - Any failure inside this filter itself (logged + swallowed so we never
 *   recurse or mask the original error)
 */
@Injectable()
@Catch()
export class ErrorCaptureFilter extends BaseExceptionFilter {
  private readonly captureLogger = new Logger(ErrorCaptureFilter.name);

  constructor(
    httpAdapterHost: HttpAdapterHost,
    private readonly errorLogService: ErrorLogService,
    private readonly requestMetadataService: RequestMetadataService,
    private readonly currentUserService: CurrentUserService,
  ) {
    super(httpAdapterHost.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const statusCode = this.resolveStatusCode(exception);

    if (statusCode >= 500) {
      try {
        this.captureError(exception, statusCode, host);
      } catch (captureError) {
        this.captureLogger.warn(
          `Failed to capture error log: ${(captureError as Error).message}`,
        );
      }
    }

    super.catch(exception, host);
  }

  private resolveStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private captureError(
    exception: unknown,
    statusCode: number,
    host: ArgumentsHost,
  ): void {
    // The filter is registered globally, but a non-HTTP request (e.g. a BullMQ
    // worker failure routed here) would not have a `getRequest` payload —
    // bail out cleanly in that case.
    if (host.getType() !== 'http') return;

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();

    const errorObj = exception instanceof Error ? exception : undefined;
    const errorName = errorObj?.name ?? 'UnknownError';
    const message =
      errorObj?.message ??
      (typeof exception === 'string' ? exception : String(exception));
    const stack = errorObj?.stack;

    const meta = this.requestMetadataService.get();
    const currentUser = this.currentUserService.get();

    void this.errorLogService.Emit({
      statusCode,
      method: request.method,
      path: request.originalUrl ?? request.url,
      userId: currentUser?.id,
      userName: currentUser?.userName,
      errorName,
      message,
      stack,
      requestBody: sanitizeRequestPayload(request.body),
      requestQuery: sanitizeRequestPayload(request.query),
      browserName: meta?.browserName,
      os: meta?.os,
      ipAddress: meta?.ipAddress,
    });
  }
}
