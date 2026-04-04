import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { AdminGenerateService } from './services/admin-generate.service';
import { GeneratePreviewRequestDto } from './dto/requests/generate-preview.request.dto';
import { GenerateCommitRequestDto } from './dto/requests/generate-commit.request.dto';
import { GeneratePreviewResponseDto } from './dto/responses/generate-preview.response.dto';
import { CommitResultDto } from './dto/responses/commit-result.response.dto';
import { SubmissionStatusResponseDto } from './dto/responses/submission-status.response.dto';
import { SubmissionStatusQueryDto } from './dto/requests/submission-status-query.dto';

@ApiTags('Admin')
@Controller('admin/generate-submissions')
@UseJwtGuard(UserRole.SUPER_ADMIN)
@ApiBearerAuth()
export class AdminGenerateController {
  constructor(private readonly generateService: AdminGenerateService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Check submission status for a faculty+course+version combination',
  })
  @ApiQuery({ name: 'versionId', required: true, type: String })
  @ApiQuery({ name: 'facultyUsername', required: true, type: String })
  @ApiQuery({ name: 'courseShortname', required: true, type: String })
  @ApiResponse({ status: 200, type: SubmissionStatusResponseDto })
  async Status(
    @Query() query: SubmissionStatusQueryDto,
  ): Promise<SubmissionStatusResponseDto> {
    return this.generateService.GetSubmissionStatus(query);
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate preview of test submissions for a questionnaire version',
  })
  @ApiResponse({ status: 200, type: GeneratePreviewResponseDto })
  async Preview(
    @Body() dto: GeneratePreviewRequestDto,
  ): Promise<GeneratePreviewResponseDto> {
    return this.generateService.GeneratePreview(dto);
  }

  @Post('commit')
  @ApiOperation({
    summary:
      'Commit generated submissions (may take time due to per-row processing)',
  })
  @ApiResponse({ status: 201, type: CommitResultDto })
  async Commit(
    @Body() dto: GenerateCommitRequestDto,
  ): Promise<CommitResultDto> {
    return this.generateService.CommitSubmissions(dto);
  }
}
