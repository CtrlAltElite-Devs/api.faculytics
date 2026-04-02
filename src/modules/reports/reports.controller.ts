import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from 'src/modules/auth/roles.enum';
import { CurrentUserInterceptor } from 'src/modules/common/interceptors/current-user.interceptor';
import type { AuthenticatedRequest } from 'src/modules/common/interceptors/http/authenticated-request';
import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { GenerateBatchReportDto } from './dto/generate-batch-report.dto';
import { ReportStatusResponseDto } from './dto/report-status.response.dto';
import { BatchStatusResponseDto } from './dto/batch-status.response.dto';

@ApiTags('Reports')
@Controller('reports')
@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN, UserRole.CHAIRPERSON)
@UseInterceptors(CurrentUserInterceptor)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Generate a single faculty evaluation PDF report' })
  @ApiResponse({ status: 202, description: 'Report generation queued' })
  async GenerateReport(
    @Body() dto: GenerateReportDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ jobId: string }> {
    return this.reportsService.GenerateSingle(dto, req.user!.userId);
  }

  @Post('generate/batch')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Generate batch faculty evaluation PDF reports' })
  @ApiResponse({ status: 202, description: 'Batch report generation queued' })
  async GenerateBatchReport(
    @Body() dto: GenerateBatchReportDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ batchId: string; jobCount: number; skippedCount: number }> {
    return this.reportsService.GenerateBatch(dto, req.user!.userId);
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Get status of a single report job' })
  @ApiResponse({ status: 200, type: ReportStatusResponseDto })
  async GetReportStatus(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReportStatusResponseDto> {
    return this.reportsService.GetJobStatus(jobId, req.user!.userId);
  }

  @Get('batch/:batchId')
  @ApiOperation({ summary: 'Get status of a batch report generation' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: BatchStatusResponseDto })
  async GetBatchStatus(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<BatchStatusResponseDto> {
    return this.reportsService.GetBatchStatus(
      batchId,
      req.user!.userId,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
