import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap } from 'rxjs';
import { AuditService } from '../audit.service';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import {
  AUDIT_META_KEY,
  type AuditedOptions,
} from '../decorators/audited.decorator';
import type { AuthenticatedRequest } from 'src/modules/common/interceptors/http/authenticated-request';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_METADATA_BYTES = 4096;

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly currentUserService: CurrentUserService,
    private readonly requestMetadataService: RequestMetadataService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const auditMeta = this.reflector.get<AuditedOptions | undefined>(
      AUDIT_META_KEY,
      context.getHandler(),
    );

    if (!auditMeta) {
      return next.handle();
    }

    const request: AuthenticatedRequest = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        try {
          const user = this.currentUserService.get();
          const actorId = user?.id ?? request.user?.userId;
          const actorUsername = user?.userName ?? undefined;

          const meta = this.requestMetadataService.get();
          if (!meta) {
            this.logger.warn(
              `Missing CLS metadata for ${context.getClass().name}.${context.getHandler().name}`,
            );
          }

          const params: Record<string, string> =
            (request.params as Record<string, string>) ?? {};
          const query: Record<string, unknown> =
            (request.query as Record<string, unknown>) ?? {};
          const rawMetadata: Record<string, unknown> = {
            ...params,
            ...query,
          };

          const resourceId =
            Object.values(params).find((v) => UUID_V4_REGEX.test(v)) ??
            undefined;

          let metadata: Record<string, unknown> | undefined;
          if (Object.keys(rawMetadata).length > 0) {
            const serialized = JSON.stringify(rawMetadata);
            metadata =
              serialized.length <= MAX_METADATA_BYTES ? rawMetadata : undefined;
          }

          this.auditService
            .Emit({
              action: auditMeta.action,
              actorId,
              actorUsername,
              resourceType: auditMeta.resource,
              resourceId,
              metadata,
              browserName: meta?.browserName,
              os: meta?.os,
              ipAddress: meta?.ipAddress,
            })
            .catch((err: Error) => {
              this.logger.error(`Audit emit error: ${err.message}`);
            });
        } catch (error) {
          this.logger.error(
            `Audit interceptor error: ${(error as Error).message}`,
          );
        }
      }),
    );
  }
}
