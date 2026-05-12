import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from 'src/modules/auth/roles.enum';
import { ErrorLogQueryService } from './error-log-query.service';
import { ListErrorLogsQueryDto } from './dto/requests/list-error-logs-query.dto';
import { ErrorLogListResponseDto } from './dto/responses/error-log-list.response.dto';
import { ErrorLogDetailResponseDto } from './dto/responses/error-log-detail.response.dto';

@ApiTags('Error Logs')
@Controller('error-logs')
@UseJwtGuard(UserRole.SUPER_ADMIN)
@ApiBearerAuth()
export class ErrorLogController {
  constructor(private readonly errorLogQueryService: ErrorLogQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'List captured 5xx errors with filters and pagination',
  })
  @ApiResponse({ status: 200, type: ErrorLogListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — superadmin only' })
  async ListErrorLogs(
    @Query() query: ListErrorLogsQueryDto,
  ): Promise<ErrorLogListResponseDto> {
    return this.errorLogQueryService.ListErrorLogs(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single error log entry with full stack + sanitized body',
  })
  @ApiParam({ name: 'id', type: String, description: 'Error log UUID' })
  @ApiResponse({ status: 200, type: ErrorLogDetailResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({ status: 404, description: 'Error log not found' })
  async GetErrorLog(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ErrorLogDetailResponseDto> {
    return this.errorLogQueryService.GetErrorLog(id);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Mark an error log entry as acknowledged' })
  @ApiParam({ name: 'id', type: String, description: 'Error log UUID' })
  @ApiResponse({ status: 200, type: ErrorLogDetailResponseDto })
  async Acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ErrorLogDetailResponseDto> {
    return this.errorLogQueryService.Acknowledge(id);
  }

  @Post(':id/unacknowledge')
  @ApiOperation({ summary: 'Reset an error log entry to unacknowledged' })
  @ApiParam({ name: 'id', type: String, description: 'Error log UUID' })
  @ApiResponse({ status: 200, type: ErrorLogDetailResponseDto })
  async Unacknowledge(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ErrorLogDetailResponseDto> {
    return this.errorLogQueryService.Unacknowledge(id);
  }
}
