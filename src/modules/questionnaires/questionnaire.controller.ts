import { Controller, Post, Body, Param, Patch } from '@nestjs/common';
import { QuestionnaireService } from './services/questionnaire.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
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
  async createVersion(
    @Param('id') id: string,
    @Body() data: CreateVersionRequest,
  ) {
    return this.questionnaireService.createVersion(id, data.schema);
  }

  @Patch('versions/:versionId/publish')
  @ApiOperation({ summary: 'Publish a questionnaire version' })
  async publishVersion(@Param('versionId') versionId: string) {
    return this.questionnaireService.publishVersion(versionId);
  }

  @Post('submissions')
  @ApiOperation({ summary: 'Submit a completed questionnaire' })
  async submitQuestionnaire(@Body() data: SubmitQuestionnaireRequest) {
    return this.questionnaireService.submitQuestionnaire(data);
  }
}
