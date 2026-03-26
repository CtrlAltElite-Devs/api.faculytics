import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  Get,
  Delete,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { QuestionnaireService } from './services/questionnaire.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiProduces,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CreateQuestionnaireRequest } from './dto/requests/create-questionnaire-request.dto';
import { CreateVersionRequest } from './dto/requests/create-version-request.dto';
import { UpdateVersionRequest } from './dto/requests/update-version-request.dto';
import { SubmitQuestionnaireRequest } from './dto/requests/submit-questionnaire-request.dto';
import { SaveDraftRequest } from './dto/requests/save-draft-request.dto';
import { GetDraftRequest } from './dto/requests/get-draft-request.dto';
import { GetVersionsByTypeParam } from './dto/requests/get-versions-by-type-request.dto';
import { IngestCsvRequestDto } from './dto/requests/ingest-csv-request.dto';
import { QuestionnaireVersionsResponse } from './dto/responses/questionnaire-version-response.dto';
import { QuestionnaireVersionDetailResponse } from './dto/responses/questionnaire-version-detail-response.dto';
import { DraftResponse } from './dto/responses/draft-response.dto';
import { CheckSubmissionQuery } from './dto/requests/check-submission-query.dto';
import { CheckSubmissionResponse } from './dto/responses/check-submission-response.dto';
import { SubmitQuestionnaireResponse } from './dto/responses/submit-questionnaire-response.dto';
import { QuestionnaireResponseDto } from './dto/responses/questionnaire-response.dto';
import { IngestionResultDto } from './ingestion/dto/ingestion-result.dto';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { IngestionEngine } from './ingestion/services/ingestion-engine.service';
import { CSVAdapter } from './ingestion/adapters/csv.adapter';
import { CSVAdapterConfig } from './ingestion/types/csv-adapter-config.type';
import { Readable } from 'stream';
function csvFileFilter(
  _req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!file.originalname.toLowerCase().endsWith('.csv')) {
    callback(
      new BadRequestException(
        'Invalid file type. Only CSV files are accepted.',
      ),
      false,
    );
    return;
  }
  callback(null, true);
}

@ApiTags('Questionnaires')
@Controller('questionnaires')
export class QuestionnaireController {
  constructor(
    private readonly questionnaireService: QuestionnaireService,
    private readonly ingestionEngine: IngestionEngine,
    private readonly csvAdapter: CSVAdapter,
  ) {}

  @Get('types')
  @ApiOperation({ summary: 'List all questionnaire types' })
  async getQuestionnaireTypes() {
    return this.questionnaireService.getQuestionnaireTypes();
  }

  @Get('types/:typeId/versions')
  @ApiOperation({ summary: 'Get versions for a questionnaire type' })
  @ApiResponse({
    status: 200,
    description: 'Versions found',
    type: QuestionnaireVersionsResponse,
  })
  async getVersionsByType(@Param() params: GetVersionsByTypeParam) {
    return this.questionnaireService.getVersionsByType(params.typeId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new questionnaire' })
  @ApiResponse({
    status: 201,
    description: 'Questionnaire created successfully',
    type: QuestionnaireResponseDto,
  })
  async createQuestionnaire(
    @Body() data: CreateQuestionnaireRequest,
  ): Promise<QuestionnaireResponseDto> {
    const questionnaire = await this.questionnaireService.createQuestionnaire({
      title: data.title,
      typeId: data.typeId,
    });
    return QuestionnaireResponseDto.Map(questionnaire);
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Create a new version for a questionnaire' })
  @ApiResponse({
    status: 201,
    description: 'Version created successfully',
    type: QuestionnaireVersionDetailResponse,
  })
  @ApiResponse({ status: 404, description: 'Questionnaire not found' })
  @ApiResponse({ status: 409, description: 'Draft version already exists' })
  async createVersion(
    @Param('id') id: string,
    @Body() data: CreateVersionRequest,
  ): Promise<QuestionnaireVersionDetailResponse> {
    const version = await this.questionnaireService.CreateVersion(
      id,
      data.schema,
    );
    return QuestionnaireVersionDetailResponse.Map(version);
  }

  @Get(':id/latest-active-version')
  @ApiOperation({
    summary: 'Get the latest active version for a questionnaire',
  })
  @ApiResponse({
    status: 200,
    description: 'Active version found or null if none exists',
  })
  @ApiResponse({ status: 404, description: 'Questionnaire not found' })
  async getLatestActiveVersion(
    @Param('id') id: string,
  ): Promise<QuestionnaireVersionDetailResponse | null> {
    const version = await this.questionnaireService.GetLatestActiveVersion(id);
    return version ? QuestionnaireVersionDetailResponse.Map(version) : null;
  }

  @Patch('versions/:versionId/publish')
  @ApiOperation({ summary: 'Publish a questionnaire version' })
  @ApiResponse({
    status: 200,
    description: 'Version published successfully',
    type: QuestionnaireVersionDetailResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Version already published or invalid schema',
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async publishVersion(
    @Param('versionId') versionId: string,
  ): Promise<QuestionnaireVersionDetailResponse> {
    const version = await this.questionnaireService.PublishVersion(versionId);
    return QuestionnaireVersionDetailResponse.Map(version);
  }

  @Patch('versions/:versionId/deprecate')
  @ApiOperation({ summary: 'Deprecate a questionnaire version' })
  @ApiResponse({
    status: 200,
    description: 'Version deprecated successfully',
    type: QuestionnaireVersionDetailResponse,
  })
  @ApiResponse({ status: 400, description: 'Version already deprecated' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async deprecateVersion(
    @Param('versionId') versionId: string,
  ): Promise<QuestionnaireVersionDetailResponse> {
    const version = await this.questionnaireService.DeprecateVersion(versionId);
    return QuestionnaireVersionDetailResponse.Map(version);
  }

  @Get('versions/:versionId')
  @UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a questionnaire version by ID' })
  @ApiResponse({
    status: 200,
    description: 'Version found',
    type: QuestionnaireVersionDetailResponse,
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async getVersionById(
    @Param('versionId') versionId: string,
  ): Promise<QuestionnaireVersionDetailResponse> {
    const version = await this.questionnaireService.GetVersionById(versionId);
    return QuestionnaireVersionDetailResponse.Map(version);
  }

  @Patch('versions/:versionId')
  @UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a draft questionnaire version' })
  @ApiResponse({
    status: 200,
    description: 'Version updated successfully',
    type: QuestionnaireVersionDetailResponse,
  })
  @ApiResponse({ status: 400, description: 'Version is not a draft' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async updateDraftVersion(
    @Param('versionId') versionId: string,
    @Body() data: UpdateVersionRequest,
  ): Promise<QuestionnaireVersionDetailResponse> {
    const version = await this.questionnaireService.UpdateDraftVersion(
      versionId,
      { schema: data.schema, title: data.title },
    );
    return QuestionnaireVersionDetailResponse.Map(version);
  }

  @Get('submissions/check')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  @ApiOperation({
    summary: 'Check if the current user already submitted an evaluation',
  })
  @ApiResponse({
    status: 200,
    description: 'Submission status for the given context',
    type: CheckSubmissionResponse,
  })
  async checkSubmission(
    @Query() query: CheckSubmissionQuery,
  ): Promise<CheckSubmissionResponse> {
    return this.questionnaireService.CheckSubmission(query);
  }

  @Post('submissions')
  @UseJwtGuard()
  @ApiOperation({ summary: 'Submit a completed questionnaire' })
  async submitQuestionnaire(
    @Body() data: SubmitQuestionnaireRequest,
  ): Promise<SubmitQuestionnaireResponse> {
    return this.questionnaireService.submitQuestionnaire(data);
  }

  @Get('versions/:versionId/csv-template')
  @UseJwtGuard(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DEAN,
    UserRole.CHAIRPERSON,
  )
  @ApiOperation({
    summary: 'Download CSV template for a questionnaire version',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, description: 'CSV template file' })
  @ApiResponse({ status: 400, description: 'Version is not active' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async GetCsvTemplate(
    @Param('versionId') versionId: string,
    @Res() res: Response,
  ): Promise<void> {
    const version = await this.questionnaireService.GetVersionById(versionId);

    if (!version.isActive) {
      throw new BadRequestException(
        `Questionnaire version ${versionId} is not active.`,
      );
    }

    const questions = this.questionnaireService.GetAllQuestions(
      version.schemaSnapshot,
    );
    const questionIds = questions.map((q) => q.id);
    const maxScore = version.schemaSnapshot.meta.maxScore;

    const headers = [
      'externalId',
      'username',
      'facultyUsername',
      'courseShortname',
      ...questionIds,
      'comment',
    ];

    const exampleValues = [
      'example_001',
      'student001',
      'faculty001',
      'CS101',
      ...questionIds.map(() => String(Math.ceil(Math.random() * maxScore))),
      'optional comment',
    ];

    const csv = [headers.join(','), exampleValues.join(',')].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="template-${versionId}.csv"`,
    );
    res.send(csv);
  }

  @Post('ingest')
  @HttpCode(200)
  @UseJwtGuard(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DEAN,
    UserRole.CHAIRPERSON,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: csvFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Ingest questionnaire submissions from CSV' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'versionId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        versionId: { type: 'string', format: 'uuid' },
        dryRun: { type: 'boolean', default: false },
        delimiter: { type: 'string', maxLength: 1 },
        maxErrors: { type: 'integer', minimum: 1 },
        maxRecords: {
          type: 'integer',
          minimum: 1,
          maximum: 5000,
          default: 500,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Ingestion result',
    type: IngestionResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or parameters' })
  @ApiResponse({
    status: 404,
    description: 'Version not found or not active',
  })
  async IngestCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: IngestCsvRequestDto,
  ): Promise<IngestionResultDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    const version = await this.questionnaireService.GetVersionById(
      dto.versionId,
    );

    if (!version.isActive) {
      throw new BadRequestException(
        `Questionnaire version ${dto.versionId} is not active.`,
      );
    }

    const questions = this.questionnaireService.GetAllQuestions(
      version.schemaSnapshot,
    );
    const questionIds = questions.map((q) => q.id);

    const readable = Readable.from(file.buffer);
    const config: CSVAdapterConfig = {
      dryRun: dto.dryRun ?? false,
      delimiter: dto.delimiter,
      maxErrors: dto.maxErrors,
      maxRecords: dto.maxRecords ?? 500,
      questionIds,
    };

    return this.ingestionEngine.processStream(
      this.csvAdapter,
      readable,
      config,
      version.id,
    );
  }

  @Delete('versions/:versionId/submissions')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Wipe all submissions for a version' })
  @ApiResponse({
    status: 200,
    description: 'Submissions wiped successfully',
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async wipeSubmissions(@Param('versionId') versionId: string) {
    return this.questionnaireService.WipeSubmissions(versionId);
  }

  @Post('drafts')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  @ApiOperation({ summary: 'Save or update a draft questionnaire' })
  @ApiResponse({ status: 201, description: 'Draft saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data or inactive version' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async saveDraft(@Body() data: SaveDraftRequest): Promise<DraftResponse> {
    const draft = await this.questionnaireService.SaveOrUpdateDraft(data);

    return {
      id: draft.id,
      versionId: draft.questionnaireVersion.id,
      facultyId: draft.faculty.id,
      semesterId: draft.semester.id,
      courseId: draft.course?.id,
      answers: draft.answers,
      qualitativeComment: draft.qualitativeComment,
      updatedAt: draft.updatedAt,
    };
  }

  @Get('drafts')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  @ApiOperation({ summary: 'Get a specific draft by query parameters' })
  @ApiResponse({
    status: 200,
    description: 'Draft found or null if no draft exists for this context',
  })
  async getDraft(
    @Query() query: GetDraftRequest,
  ): Promise<DraftResponse | null> {
    // Security: Always filter by authenticated user's ID to prevent information disclosure
    // Returns null if no draft exists (rather than 404) since "no draft yet" is a valid state
    const draft = await this.questionnaireService.GetDraft(query);

    if (!draft) {
      return null;
    }

    return {
      id: draft.id,
      versionId: draft.questionnaireVersion.id,
      facultyId: draft.faculty.id,
      semesterId: draft.semester.id,
      courseId: draft.course?.id,
      answers: draft.answers,
      qualitativeComment: draft.qualitativeComment,
      updatedAt: draft.updatedAt,
    };
  }

  @Get('drafts/list')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  @ApiOperation({ summary: 'List all drafts for the current user' })
  @ApiResponse({ status: 200, description: 'Drafts retrieved successfully' })
  async listMyDrafts(): Promise<DraftResponse[]> {
    const drafts = await this.questionnaireService.ListMyDrafts();

    return drafts.map((draft) => ({
      id: draft.id,
      versionId: draft.questionnaireVersion.id,
      facultyId: draft.faculty.id,
      semesterId: draft.semester.id,
      courseId: draft.course?.id,
      answers: draft.answers,
      qualitativeComment: draft.qualitativeComment,
      updatedAt: draft.updatedAt,
    }));
  }

  @Delete('drafts/:id')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  @ApiOperation({ summary: 'Delete a draft by ID' })
  @ApiResponse({ status: 200, description: 'Draft deleted successfully' })
  @ApiResponse({ status: 404, description: 'Draft not found' })
  async deleteDraft(@Param('id') id: string): Promise<{ message: string }> {
    await this.questionnaireService.DeleteDraft(id);
    return { message: 'Draft deleted successfully' };
  }
}
