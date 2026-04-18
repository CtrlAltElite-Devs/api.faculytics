import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { env } from 'src/configurations/index.config';
import { UseJwtGuard } from 'src/security/decorators';
import { AuditAction } from 'src/modules/audit/audit-action.enum';
import { AuditInterceptor } from 'src/modules/audit/interceptors/audit.interceptor';
import { AuditService } from 'src/modules/audit/audit.service';
import { MetaDataInterceptor } from 'src/modules/common/interceptors/metadata.interceptor';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import { UserRole } from 'src/modules/auth/roles.enum';
import { SentimentConfigService } from '../services/sentiment-config.service';
import { UpdateSentimentVllmConfigRequestDto } from '../dto/requests/update-sentiment-vllm-config.request.dto';
import { SentimentVllmConfigResponseDto } from '../dto/responses/sentiment-vllm-config.response.dto';

@ApiTags('Admin / Sentiment')
@Controller('admin/sentiment/vllm-config')
@UseInterceptors(MetaDataInterceptor, AuditInterceptor)
export class AdminSentimentConfigController {
  private readonly logger = new Logger(AdminSentimentConfigController.name);

  constructor(
    private readonly sentimentConfigService: SentimentConfigService,
    private readonly auditService: AuditService,
    private readonly currentUserService: CurrentUserService,
    private readonly requestMetadataService: RequestMetadataService,
  ) {}

  @Get()
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current sentiment vLLM configuration' })
  @ApiResponse({ status: 200, type: SentimentVllmConfigResponseDto })
  async GetConfig(): Promise<SentimentVllmConfigResponseDto> {
    const config = await this.sentimentConfigService.readConfig();
    return new SentimentVllmConfigResponseDto(config);
  }

  // NOTE: this handler does NOT use @Audited() — it emits the audit manually
  // below with a `{ previous, next }` metadata payload that the interceptor
  // can't produce. Using both would double-audit every URL rotation (F10).
  @Put()
  @HttpCode(HttpStatus.OK)
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Update sentiment vLLM configuration (URL, model, enabled). Rejects enabling vLLM in production unless ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=true.',
  })
  @ApiResponse({ status: 200, type: SentimentVllmConfigResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Validation error (bad URL), cross-field rejection (enabled with empty URL/model), or production gate block.',
  })
  async UpdateConfig(
    @Body() dto: UpdateSentimentVllmConfigRequestDto,
  ): Promise<SentimentVllmConfigResponseDto> {
    if (
      dto.enabled === true &&
      env.NODE_ENV === 'production' &&
      env.ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD !== true
    ) {
      throw new BadRequestException(
        'Enabling vLLM in production requires ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD=true',
      );
    }

    // Single read+write path: `updateConfig` returns both sides of the
    // transition (F8 fix — avoids TOCTOU between controller-side read and
    // service-side read).
    const { previous, next } =
      await this.sentimentConfigService.updateConfig(dto);

    try {
      const user = this.currentUserService.get();
      const meta = this.requestMetadataService.get();
      await this.auditService.Emit({
        action: AuditAction.ADMIN_SENTIMENT_VLLM_CONFIG_UPDATE,
        actorId: user?.id,
        actorUsername: user?.userName ?? undefined,
        resourceType: 'SystemConfig',
        resourceId: 'SENTIMENT_VLLM_CONFIG',
        metadata: { previous, next },
        browserName: meta?.browserName,
        os: meta?.os,
        ipAddress: meta?.ipAddress,
      });
    } catch (error) {
      this.logger.warn(
        `Before/after audit emit failed: ${(error as Error).message}`,
      );
    }

    return new SentimentVllmConfigResponseDto(next);
  }
}
