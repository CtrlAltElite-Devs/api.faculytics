import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorLog } from 'src/entities/error-log.entity';

export class ErrorLogDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 500 })
  statusCode: number;

  @ApiProperty({ example: 'POST' })
  method: string;

  @ApiProperty({ example: '/api/v1/auth/login' })
  path: string;

  @ApiPropertyOptional()
  userId?: string;

  @ApiPropertyOptional()
  userName?: string;

  @ApiProperty({ example: 'TypeError' })
  errorName: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional({ description: 'Full stack trace (may be large)' })
  stack?: string;

  @ApiPropertyOptional({
    description: 'Captured request body with sensitive fields redacted',
  })
  requestBody?: Record<string, unknown>;

  @ApiPropertyOptional()
  requestQuery?: Record<string, unknown>;

  @ApiPropertyOptional()
  browserName?: string;

  @ApiPropertyOptional()
  os?: string;

  @ApiPropertyOptional()
  ipAddress?: string;

  @ApiPropertyOptional()
  acknowledgedAt?: Date;

  @ApiPropertyOptional()
  acknowledgedBy?: string;

  @ApiProperty()
  occurredAt: Date;

  static Map(entity: ErrorLog): ErrorLogDetailResponseDto {
    return {
      id: entity.id,
      statusCode: entity.statusCode,
      method: entity.method,
      path: entity.path,
      userId: entity.userId,
      userName: entity.userName,
      errorName: entity.errorName,
      message: entity.message,
      stack: entity.stack,
      requestBody: entity.requestBody,
      requestQuery: entity.requestQuery,
      browserName: entity.browserName,
      os: entity.os,
      ipAddress: entity.ipAddress,
      acknowledgedAt: entity.acknowledgedAt,
      acknowledgedBy: entity.acknowledgedBy,
      occurredAt: entity.occurredAt,
    };
  }
}
