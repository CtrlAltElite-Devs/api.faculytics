import type { TestingModuleBuilder } from '@nestjs/testing';
import type { Provider } from '@nestjs/common';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import { AuditService } from '../audit.service';
import { MetaDataInterceptor } from 'src/modules/common/interceptors/metadata.interceptor';
import { AuditInterceptor } from '../interceptors/audit.interceptor';

const noop = {
  intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle(),
};

export function auditTestProviders(): Provider[] {
  return [
    {
      provide: RequestMetadataService,
      useValue: { get: jest.fn(), set: jest.fn() },
    },
    {
      provide: AuditService,
      useValue: { Emit: jest.fn().mockResolvedValue(undefined) },
    },
  ];
}

export function overrideAuditInterceptors(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  return builder
    .overrideInterceptor(MetaDataInterceptor)
    .useValue(noop)
    .overrideInterceptor(AuditInterceptor)
    .useValue(noop);
}
