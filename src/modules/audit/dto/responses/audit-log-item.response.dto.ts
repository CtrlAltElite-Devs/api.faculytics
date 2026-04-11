import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditLog } from 'src/entities/audit-log.entity';

export class AuditLogItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'auth.login.success' })
  action: string;

  @ApiPropertyOptional()
  actorId?: string;

  @ApiPropertyOptional()
  actorUsername?: string;

  @ApiPropertyOptional()
  resourceType?: string;

  @ApiPropertyOptional()
  resourceId?: string;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional()
  browserName?: string;

  @ApiPropertyOptional()
  os?: string;

  @ApiPropertyOptional()
  ipAddress?: string;

  @ApiProperty()
  occurredAt: Date;

  static Map(entity: AuditLog): AuditLogItemResponseDto {
    return {
      id: entity.id,
      action: entity.action,
      actorId: entity.actorId,
      actorUsername: entity.actorUsername,
      resourceType: entity.resourceType,
      resourceId: entity.resourceId,
      metadata: entity.metadata,
      browserName: entity.browserName,
      os: entity.os,
      ipAddress: entity.ipAddress,
      occurredAt: entity.occurredAt,
    };
  }
}
