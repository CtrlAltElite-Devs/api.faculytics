import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  Get,
  Delete,
  Query,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { QuestionnaireService } from './services/questionnaire.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateQuestionnaireRequest } from './dto/requests/create-questionnaire-request.dto';
import { CreateVersionRequest } from './dto/requests/create-version-request.dto';
import { SubmitQuestionnaireRequest } from './dto/requests/submit-questionnaire-request.dto';
import { SaveDraftRequest } from './dto/requests/save-draft-request.dto';
import { GetDraftRequest } from './dto/requests/get-draft-request.dto';
import { DraftResponse } from './dto/responses/draft-response.dto';
import { UseJwtGuard } from 'src/security/decorators';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import type { AuthenticatedRequest } from '../common/interceptors/http/authenticated-request';

@ApiTags('Questionnaires')
@Controller('questionnaires')
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new questionnaire' })
  async createQuestionnaire(@Body() data: CreateQuestionnaireRequest) {
    return this.questionnaireService.createQuestionnaire(data);
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Create a new version for a questionnaire' })
  @ApiResponse({ status: 201, description: 'Version created successfully' })
  @ApiResponse({ status: 404, description: 'Questionnaire not found' })
  @ApiResponse({ status: 409, description: 'Draft version already exists' })
  async createVersion(
    @Param('id') id: string,
    @Body() data: CreateVersionRequest,
  ) {
    return this.questionnaireService.CreateVersion(id, data.schema);
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
  async getLatestActiveVersion(@Param('id') id: string) {
    return this.questionnaireService.GetLatestActiveVersion(id);
  }

  @Patch('versions/:versionId/publish')
  @ApiOperation({ summary: 'Publish a questionnaire version' })
  @ApiResponse({ status: 200, description: 'Version published successfully' })
  @ApiResponse({
    status: 400,
    description: 'Version already published or invalid schema',
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async publishVersion(@Param('versionId') versionId: string) {
    return this.questionnaireService.PublishVersion(versionId);
  }

  @Patch('versions/:versionId/deprecate')
  @ApiOperation({ summary: 'Deprecate a questionnaire version' })
  @ApiResponse({ status: 200, description: 'Version deprecated successfully' })
  @ApiResponse({ status: 400, description: 'Version already deprecated' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async deprecateVersion(@Param('versionId') versionId: string) {
    return this.questionnaireService.DeprecateVersion(versionId);
  }

  @Post('submissions')
  @UseJwtGuard()
  @ApiOperation({ summary: 'Submit a completed questionnaire' })
  async submitQuestionnaire(@Body() data: SubmitQuestionnaireRequest) {
    return this.questionnaireService.submitQuestionnaire(data);
  }

  @Post('drafts')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  @ApiOperation({ summary: 'Save or update a draft questionnaire' })
  @ApiResponse({ status: 201, description: 'Draft saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data or inactive version' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async saveDraft(
    @Body() data: SaveDraftRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<DraftResponse> {
    const draft = await this.questionnaireService.SaveOrUpdateDraft(
      request.currentUser!.id,
      data,
    );

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
    @Request() request: AuthenticatedRequest,
  ): Promise<DraftResponse | null> {
    // Security: Always filter by authenticated user's ID to prevent information disclosure
    // Returns null if no draft exists (rather than 404) since "no draft yet" is a valid state
    const draft = await this.questionnaireService.GetDraft(
      request.currentUser!.id,
      query,
    );

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
  async listMyDrafts(
    @Request() request: AuthenticatedRequest,
  ): Promise<DraftResponse[]> {
    const drafts = await this.questionnaireService.ListMyDrafts(
      request.currentUser!.id,
    );

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
  async deleteDraft(
    @Param('id') id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.questionnaireService.DeleteDraft(request.currentUser!.id, id);
    return { message: 'Draft deleted successfully' };
  }
}
