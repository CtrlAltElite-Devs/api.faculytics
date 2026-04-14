import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from 'src/modules/auth/roles.enum';
import { MetaDataInterceptor } from '../common/interceptors/metadata.interceptor';
import { AuditInterceptor } from '../audit/interceptors/audit.interceptor';
import { Audited } from '../audit/decorators/audited.decorator';
import { AuditAction } from '../audit/audit-action.enum';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import type { AuthenticatedRequest } from '../common/interceptors/http/authenticated-request';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { ListPipelinesQueryDto } from './dto/list-pipelines.dto';
import { PipelineSummaryResponseDto } from './dto/responses/pipeline-summary.response.dto';

@ApiTags('Analysis')
@Controller('analysis')
@UseJwtGuard(
  UserRole.DEAN,
  UserRole.CHAIRPERSON,
  UserRole.CAMPUS_HEAD,
  UserRole.SUPER_ADMIN,
)
@UseInterceptors(CurrentUserInterceptor)
export class AnalysisController {
  constructor(private readonly orchestrator: PipelineOrchestratorService) {}

  @Post('pipelines')
  @Audited({
    action: AuditAction.ANALYSIS_PIPELINE_CREATE,
    resource: 'AnalysisPipeline',
  })
  @UseInterceptors(MetaDataInterceptor, AuditInterceptor)
  @ApiOperation({ summary: 'Create an analysis pipeline' })
  async CreatePipeline(
    @Body() body: CreatePipelineDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const pipeline = await this.orchestrator.CreatePipeline(
      body,
      req.user!.userId,
    );
    return PipelineSummaryResponseDto.Map(pipeline);
  }

  @Get('pipelines')
  @UseJwtGuard(
    UserRole.DEAN,
    UserRole.CHAIRPERSON,
    UserRole.CAMPUS_HEAD,
    UserRole.SUPER_ADMIN,
    UserRole.FACULTY,
  )
  @ApiOperation({ summary: 'List pipelines for a scope' })
  async ListPipelines(@Query() query: ListPipelinesQueryDto) {
    const pipelines = await this.orchestrator.ListPipelines(query);
    return pipelines.map((p) => PipelineSummaryResponseDto.Map(p));
  }

  @Post('pipelines/:id/confirm')
  @Audited({
    action: AuditAction.ANALYSIS_PIPELINE_CONFIRM,
    resource: 'AnalysisPipeline',
  })
  @UseInterceptors(MetaDataInterceptor, AuditInterceptor)
  @ApiOperation({ summary: 'Confirm and start pipeline execution' })
  async ConfirmPipeline(@Param('id', ParseUUIDPipe) id: string) {
    const pipeline = await this.orchestrator.ConfirmPipeline(id);
    return PipelineSummaryResponseDto.Map(pipeline);
  }

  @Post('pipelines/:id/cancel')
  @Audited({
    action: AuditAction.ANALYSIS_PIPELINE_CANCEL,
    resource: 'AnalysisPipeline',
  })
  @UseInterceptors(MetaDataInterceptor, AuditInterceptor)
  @ApiOperation({ summary: 'Cancel a non-terminal pipeline' })
  async CancelPipeline(@Param('id', ParseUUIDPipe) id: string) {
    const pipeline = await this.orchestrator.CancelPipeline(id);
    return PipelineSummaryResponseDto.Map(pipeline);
  }

  @Get('pipelines/:id/status')
  @UseJwtGuard(
    UserRole.DEAN,
    UserRole.CHAIRPERSON,
    UserRole.CAMPUS_HEAD,
    UserRole.SUPER_ADMIN,
    UserRole.FACULTY,
  )
  @ApiOperation({ summary: 'Get pipeline status' })
  async GetPipelineStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.orchestrator.GetPipelineStatus(id);
  }

  @Get('pipelines/:id/recommendations')
  @UseJwtGuard(
    UserRole.DEAN,
    UserRole.CHAIRPERSON,
    UserRole.CAMPUS_HEAD,
    UserRole.SUPER_ADMIN,
    UserRole.FACULTY,
  )
  @ApiOperation({ summary: 'Get recommendations for a completed pipeline' })
  async GetRecommendations(@Param('id', ParseUUIDPipe) id: string) {
    return this.orchestrator.GetRecommendations(id);
  }
}
