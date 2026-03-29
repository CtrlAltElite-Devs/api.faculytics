import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { QuestionnaireTypeService } from './services/questionnaire-type.service';
import { CreateQuestionnaireTypeRequest } from './dto/requests/create-questionnaire-type-request.dto';
import { UpdateQuestionnaireTypeRequest } from './dto/requests/update-questionnaire-type-request.dto';
import { ListQuestionnaireTypesQueryDto } from './dto/requests/list-questionnaire-types-query.dto';
import { QuestionnaireTypeDetailResponse } from './dto/responses/questionnaire-type-detail-response.dto';

@ApiTags('Questionnaire Types')
@Controller('questionnaire-types')
export class QuestionnaireTypeController {
  constructor(
    private readonly questionnaireTypeService: QuestionnaireTypeService,
  ) {}

  @Post()
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new questionnaire type (admin)' })
  async create(
    @Body() dto: CreateQuestionnaireTypeRequest,
  ): Promise<QuestionnaireTypeDetailResponse> {
    const entity = await this.questionnaireTypeService.Create(dto);
    return QuestionnaireTypeDetailResponse.Map(entity);
  }

  @Get()
  @UseJwtGuard()
  @ApiOperation({
    summary: 'List all questionnaire types (admin management view)',
  })
  async findAll(
    @Query() query: ListQuestionnaireTypesQueryDto,
  ): Promise<QuestionnaireTypeDetailResponse[]> {
    const entities = await this.questionnaireTypeService.FindAll({
      isSystem: query.isSystem,
    });
    return entities.map((e) => QuestionnaireTypeDetailResponse.Map(e));
  }

  @Get(':id')
  @UseJwtGuard()
  @ApiOperation({ summary: 'Get a questionnaire type by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuestionnaireTypeDetailResponse> {
    const entity = await this.questionnaireTypeService.FindOne(id);
    return QuestionnaireTypeDetailResponse.Map(entity);
  }

  @Patch(':id')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a questionnaire type (admin)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionnaireTypeRequest,
  ): Promise<QuestionnaireTypeDetailResponse> {
    const entity = await this.questionnaireTypeService.Update(id, dto);
    return QuestionnaireTypeDetailResponse.Map(entity);
  }

  @Delete(':id')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a questionnaire type (admin)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.questionnaireTypeService.Remove(id);
    return { message: 'Questionnaire type deleted successfully.' };
  }
}
