import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Questionnaire } from '../../entities/questionnaire.entity';
import { QuestionnaireVersion } from '../../entities/questionnaire-version.entity';
import { QuestionnaireType } from '../../entities/questionnaire-type.entity';
import {
  QuestionnaireStatus,
  QuestionnaireSchemaSnapshot,
} from '../../modules/questionnaires/lib/questionnaire.types';
import { FACULTY_FEEDBACK_SCHEMA_V1 } from '../../modules/questionnaires/lib/schemas/faculty-feedback.schema';
import { FACULTY_IN_CLASSROOM_SCHEMA_V1 } from '../../modules/questionnaires/lib/schemas/faculty-in-classroom.schema';
import { FACULTY_OUT_OF_CLASSROOM_SCHEMA_V1 } from '../../modules/questionnaires/lib/schemas/faculty-out-of-classroom.schema';

interface QuestionnaireSeedData {
  title: string;
  typeCode: string;
  schema: QuestionnaireSchemaSnapshot;
}

const QUESTIONNAIRE_SEEDS: QuestionnaireSeedData[] = [
  {
    title: 'Faculty In-Classroom Evaluation',
    typeCode: 'FACULTY_IN_CLASSROOM',
    schema: FACULTY_IN_CLASSROOM_SCHEMA_V1,
  },
  {
    title: 'Faculty Out-of-Classroom Evaluation',
    typeCode: 'FACULTY_OUT_OF_CLASSROOM',
    schema: FACULTY_OUT_OF_CLASSROOM_SCHEMA_V1,
  },
  {
    title: 'Faculty Feedback Evaluation',
    typeCode: 'FACULTY_FEEDBACK',
    schema: FACULTY_FEEDBACK_SCHEMA_V1,
  },
];

export class QuestionnaireSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const seed of QUESTIONNAIRE_SEEDS) {
      const typeEntity = await em.findOne(QuestionnaireType, {
        code: seed.typeCode,
      });

      if (!typeEntity) {
        continue;
      }

      const exists = await em.findOne(Questionnaire, { type: typeEntity });

      if (exists) {
        continue;
      }

      const questionnaire = new Questionnaire();
      questionnaire.title = seed.title;
      questionnaire.type = typeEntity;
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
