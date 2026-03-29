import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { MetaDataInterceptor } from '../common/interceptors/metadata.interceptor';
import { AuditInterceptor } from '../audit/interceptors/audit.interceptor';
import { Audited } from '../audit/decorators/audited.decorator';
import { AuditAction } from '../audit/audit-action.enum';
import type { AuthenticatedRequest } from '../common/interceptors/http/authenticated-request';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { PipelineResponseDto } from './dto/responses/pipeline.response.dto';

@ApiTags('Analysis')
@Controller('analysis')
@UseJwtGuard()
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
    return PipelineResponseDto.Map(pipeline);
  }

  @Post('pipelines/:id/confirm')
  @Audited({
    action: AuditAction.ANALYSIS_PIPELINE_CONFIRM,
    resource: 'AnalysisPipeline',
  })
  @UseInterceptors(MetaDataInterceptor, AuditInterceptor)
  @ApiOperation({ summary: 'Confirm and start pipeline execution' })
  async ConfirmPipeline(@Param('id') id: string) {
    const pipeline = await this.orchestrator.ConfirmPipeline(id);
    return PipelineResponseDto.Map(pipeline);
  }

  @Post('pipelines/:id/cancel')
  @Audited({
    action: AuditAction.ANALYSIS_PIPELINE_CANCEL,
    resource: 'AnalysisPipeline',
  })
  @UseInterceptors(MetaDataInterceptor, AuditInterceptor)
  @ApiOperation({ summary: 'Cancel a non-terminal pipeline' })
  async CancelPipeline(@Param('id') id: string) {
    const pipeline = await this.orchestrator.CancelPipeline(id);
    return PipelineResponseDto.Map(pipeline);
  }

  @Get('pipelines/:id/status')
  @ApiOperation({ summary: 'Get pipeline status' })
  async GetPipelineStatus(@Param('id') id: string) {
    return this.orchestrator.GetPipelineStatus(id);
  }

  @Get('pipelines/:id/recommendations')
  @ApiOperation({ summary: 'Get recommendations for a completed pipeline' })
  async GetRecommendations(@Param('id') id: string) {
    return this.orchestrator.GetRecommendations(id);
  }
}
