import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import type { AuthenticatedRequest } from '../common/interceptors/http/authenticated-request';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';

@ApiTags('Analysis')
@Controller('analysis')
@UseJwtGuard()
export class AnalysisController {
  constructor(private readonly orchestrator: PipelineOrchestratorService) {}

  @Post('pipelines')
  @ApiOperation({ summary: 'Create an analysis pipeline' })
  async CreatePipeline(
    @Body() body: CreatePipelineDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.orchestrator.CreatePipeline(body, req.user!.userId);
  }

  @Post('pipelines/:id/confirm')
  @ApiOperation({ summary: 'Confirm and start pipeline execution' })
  async ConfirmPipeline(@Param('id') id: string) {
    return this.orchestrator.ConfirmPipeline(id);
  }

  @Post('pipelines/:id/cancel')
  @ApiOperation({ summary: 'Cancel a non-terminal pipeline' })
  async CancelPipeline(@Param('id') id: string) {
    return this.orchestrator.CancelPipeline(id);
  }

  @Get('pipelines/:id/status')
  @ApiOperation({ summary: 'Get pipeline status' })
  async GetPipelineStatus(@Param('id') id: string) {
    return this.orchestrator.GetPipelineStatus(id);
  }
}
