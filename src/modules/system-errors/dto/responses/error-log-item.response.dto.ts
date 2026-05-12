import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorLog } from 'src/entities/error-log.entity';

export class ErrorLogItemResponseDto {
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

  @ApiPropertyOptional()
  acknowledgedAt?: Date;

  @ApiProperty()
  occurredAt: Date;

  static Map(entity: ErrorLog): ErrorLogItemResponseDto {
    return {
      id: entity.id,
      statusCode: entity.statusCode,
      method: entity.method,
      path: entity.path,
      userId: entity.userId,
      userName: entity.userName,
      errorName: entity.errorName,
      message: entity.message,
      acknowledgedAt: entity.acknowledgedAt,
      occurredAt: entity.occurredAt,
    };
  }
}
