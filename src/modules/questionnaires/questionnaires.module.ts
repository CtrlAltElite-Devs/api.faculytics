import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireAnswer,
  QuestionnaireDraft,
  Dimension,
  Enrollment,
} from '../../entities/index.entity';
import { QuestionnaireService } from './services/questionnaire.service';
import { QuestionnaireController } from './questionnaire.controller';
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

@Module({
  imports: [
    MikroOrmModule.forFeature([
      Questionnaire,
      QuestionnaireVersion,
      QuestionnaireSubmission,
      QuestionnaireAnswer,
      QuestionnaireDraft,
      Dimension,
      Enrollment,
    ]),
    DataLoaderModule,
  ],
  controllers: [QuestionnaireController],
  providers: [
    QuestionnaireService,
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
  exports: [QuestionnaireService],
})
export class QuestionnaireModule {}
