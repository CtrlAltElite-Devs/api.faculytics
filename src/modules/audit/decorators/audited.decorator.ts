import { SetMetadata } from '@nestjs/common';
import type { AuditAction } from '../audit-action.enum';

export const AUDIT_META_KEY = 'audit:meta';

export interface AuditedOptions {
  action: AuditAction;
  resource?: string;
}

export const Audited = (options: AuditedOptions) =>
  SetMetadata(AUDIT_META_KEY, options);
