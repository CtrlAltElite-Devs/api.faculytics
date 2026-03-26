import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { QuestionnaireType } from '../../entities/questionnaire-type.entity';

const SYSTEM_TYPES = [
  {
    name: 'Faculty In-Classroom',
    code: 'FACULTY_IN_CLASSROOM',
    description: 'In-classroom faculty evaluation',
  },
  {
    name: 'Faculty Out-of-Classroom',
    code: 'FACULTY_OUT_OF_CLASSROOM',
    description: 'Out-of-classroom faculty evaluation',
  },
  {
    name: 'Faculty Feedback',
    code: 'FACULTY_FEEDBACK',
    description: 'General faculty feedback evaluation',
  },
];

export class QuestionnaireTypeSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const data of SYSTEM_TYPES) {
      const exists = await em.findOne(QuestionnaireType, { code: data.code });

      if (!exists) {
        em.create(QuestionnaireType, {
          ...data,
          isSystem: true,
        });
      }
    }
  }
}
