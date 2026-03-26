import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Dimension } from '../../entities/dimension.entity';
import { QuestionnaireType } from '../../entities/questionnaire-type.entity';
import { DEFAULT_DIMENSIONS } from '../../modules/questionnaires/lib/dimension.constants';

export class DimensionSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const data of DEFAULT_DIMENSIONS) {
      const { questionnaireType: typeCode, ...rest } = data;

      const typeEntity = await em.findOne(QuestionnaireType, {
        code: typeCode,
      });

      if (!typeEntity) {
        continue;
      }

      const exists = await em.findOne(Dimension, {
        code: rest.code,
        questionnaireType: typeEntity,
      });

      if (!exists) {
        em.create(Dimension, {
          ...rest,
          questionnaireType: typeEntity,
          active: true,
        });
      }
    }
  }
}
