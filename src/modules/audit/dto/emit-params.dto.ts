import type { AuditAction } from '../audit-action.enum';

export interface EmitParams {
  action: AuditAction;
  actorId?: string;
  actorUsername?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  browserName?: string;
  os?: string;
  ipAddress?: string;
}
