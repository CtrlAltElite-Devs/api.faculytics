import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  Questionnaire,
  QuestionnaireType,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireAnswer,
  QuestionnaireDraft,
  Dimension,
  Enrollment,
  User,
} from '../../entities/index.entity';
import { QuestionnaireService } from './services/questionnaire.service';
import { QuestionnaireTypeService } from './services/questionnaire-type.service';
import { QuestionnaireController } from './questionnaire.controller';
import { QuestionnaireTypeController } from './questionnaire-type.controller';
import { QuestionnaireSchemaValidator } from './services/questionnaire-schema.validator';
import { ScoringService } from './services/scoring.service';
import { SourceAdapterFactory } from './ingestion/factories/source-adapter.factory';
import { SOURCE_ADAPTER_PREFIX } from './ingestion/constants/ingestion.constants';
import { SourceType } from './ingestion/types/source-type.enum';
import { CSVAdapter } from './ingestion/adapters/csv.adapter';
import { ExcelAdapter } from './ingestion/adapters/excel.adapter';
import { ErrorFormatter } from './ingestion/utils/error-formatter.util';
import { IngestionEngine } from './ingestion/services/ingestion-engine.service';
import { IngestionMapperService } from './ingestion/services/ingestion-mapper.service';
import DataLoaderModule from '../common/data-loaders/index.module';
import { CommonModule } from '../common/common.module';
import { AnalysisModule } from '../analysis/analysis.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      QuestionnaireType,
      Questionnaire,
      QuestionnaireVersion,
      QuestionnaireSubmission,
      QuestionnaireAnswer,
      QuestionnaireDraft,
      Dimension,
      Enrollment,
      User,
    ]),
    DataLoaderModule,
    CommonModule,
    AnalysisModule,
  ],
  controllers: [QuestionnaireController, QuestionnaireTypeController],
  providers: [
    QuestionnaireService,
    QuestionnaireTypeService,
    QuestionnaireSchemaValidator,
    ScoringService,
    SourceAdapterFactory,
    CSVAdapter,
    ExcelAdapter,
    ErrorFormatter,
    IngestionEngine,
    IngestionMapperService,
    {
      provide: `${SOURCE_ADAPTER_PREFIX}${SourceType.CSV}`,
      useExisting: CSVAdapter,
    },
    {
      provide: `${SOURCE_ADAPTER_PREFIX}${SourceType.EXCEL}`,
      useExisting: ExcelAdapter,
    },
  ],
  exports: [QuestionnaireService, QuestionnaireTypeService],
})
export class QuestionnaireModule {}
