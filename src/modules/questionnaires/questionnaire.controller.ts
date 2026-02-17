import { Controller, Post, Body, Param, Patch, Get } from '@nestjs/common';
import { QuestionnaireService } from './services/questionnaire.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateQuestionnaireRequest } from './dto/requests/create-questionnaire-request.dto';
import { CreateVersionRequest } from './dto/requests/create-version-request.dto';
import { SubmitQuestionnaireRequest } from './dto/requests/submit-questionnaire-request.dto';

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
  @ApiOperation({ summary: 'Submit a completed questionnaire' })
  async submitQuestionnaire(@Body() data: SubmitQuestionnaireRequest) {
    return this.questionnaireService.submitQuestionnaire(data);
  }
}
