import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Questionnaire } from '../../entities/questionnaire.entity';
import { QuestionnaireVersion } from '../../entities/questionnaire-version.entity';
import {
  QuestionnaireStatus,
  QuestionnaireType,
  QuestionnaireSchemaSnapshot,
} from '../../modules/questionnaires/lib/questionnaire.types';
import { FACULTY_FEEDBACK_SCHEMA_V1 } from '../../modules/questionnaires/lib/schemas/faculty-feedback.schema';
import { FACULTY_IN_CLASSROOM_SCHEMA_V1 } from '../../modules/questionnaires/lib/schemas/faculty-in-classroom.schema';
import { FACULTY_OUT_OF_CLASSROOM_SCHEMA_V1 } from '../../modules/questionnaires/lib/schemas/faculty-out-of-classroom.schema';

interface QuestionnaireSeedData {
  title: string;
  type: QuestionnaireType;
  schema: QuestionnaireSchemaSnapshot;
}

const QUESTIONNAIRE_SEEDS: QuestionnaireSeedData[] = [
  {
    title: 'Faculty In-Classroom Evaluation',
    type: QuestionnaireType.FACULTY_IN_CLASSROOM,
    schema: FACULTY_IN_CLASSROOM_SCHEMA_V1,
  },
  {
    title: 'Faculty Out-of-Classroom Evaluation',
    type: QuestionnaireType.FACULTY_OUT_OF_CLASSROOM,
    schema: FACULTY_OUT_OF_CLASSROOM_SCHEMA_V1,
  },
  {
    title: 'Faculty Feedback Evaluation',
    type: QuestionnaireType.FACULTY_FEEDBACK,
    schema: FACULTY_FEEDBACK_SCHEMA_V1,
  },
];

export class QuestionnaireSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const seed of QUESTIONNAIRE_SEEDS) {
      const exists = await em.findOne(Questionnaire, { type: seed.type });

      if (exists) {
        continue;
      }

      const questionnaire = new Questionnaire();
      questionnaire.title = seed.title;
      questionnaire.type = seed.type;
      questionnaire.status = QuestionnaireStatus.ACTIVE;
      em.persist(questionnaire);

      const version = new QuestionnaireVersion();
      version.questionnaire = questionnaire;
      version.versionNumber = 1;
      version.schemaSnapshot = seed.schema;
      version.publishedAt = new Date();
      version.isActive = true;
      version.status = QuestionnaireStatus.ACTIVE;
      em.persist(version);
    }
  }
}
