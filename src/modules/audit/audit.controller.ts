import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from 'src/modules/auth/roles.enum';
import { AuditQueryService } from './audit-query.service';
import { ListAuditLogsQueryDto } from './dto/requests/list-audit-logs-query.dto';
import { AuditLogListResponseDto } from './dto/responses/audit-log-list.response.dto';
import { AuditLogDetailResponseDto } from './dto/responses/audit-log-detail.response.dto';

@ApiTags('Audit')
@Controller('audit-logs')
@UseJwtGuard(UserRole.SUPER_ADMIN)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs with filters and pagination' })
  @ApiQuery({
    name: 'action',
    required: false,
    type: String,
    example: 'auth.login.success',
    description: 'Filter by exact audit action code',
  })
  @ApiQuery({
    name: 'actorId',
    required: false,
    type: String,
    example: '3f6dd1dd-8f33-4b2e-bb0b-6ac2d8bbf5d7',
    description: 'Filter by actor UUID',
  })
  @ApiQuery({
    name: 'actorUsername',
    required: false,
    type: String,
    example: 'admin',
    description: 'Filter by actor username (partial match)',
  })
  @ApiQuery({
    name: 'resourceType',
    required: false,
    type: String,
    example: 'User',
    description: 'Filter by resource type',
  })
  @ApiQuery({
    name: 'resourceId',
    required: false,
    type: String,
    example: '9ad12fa1-6286-4461-93f8-33b48d2e5725',
    description: 'Filter by resource UUID',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-01-01T00:00:00.000Z',
    description: 'Lower bound (inclusive) on occurredAt (ISO 8601)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-12-31T23:59:59.999Z',
    description: 'Upper bound (inclusive) on occurredAt (ISO 8601)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'login',
    description:
      'General text search across actorUsername, action, and resourceType',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number starting at 1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Items per page, max 100',
  })
  @ApiResponse({ status: 200, type: AuditLogListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — superadmin only' })
  async ListAuditLogs(
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditQueryService.ListAuditLogs(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single audit log entry by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Audit log UUID' })
  @ApiResponse({ status: 200, type: AuditLogDetailResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  async GetAuditLog(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AuditLogDetailResponseDto> {
    return this.auditQueryService.GetAuditLog(id);
  }
}
