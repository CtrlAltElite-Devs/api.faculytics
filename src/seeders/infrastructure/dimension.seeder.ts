import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { Dimension } from '../../entities/dimension.entity';
import { DEFAULT_DIMENSIONS } from '../../modules/questionnaires/lib/dimension.constants';

export class DimensionSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    for (const data of DEFAULT_DIMENSIONS) {
      const exists = await em.findOne(Dimension, {
        code: data.code,
        questionnaireType: data.questionnaireType,
      });

      if (!exists) {
        em.create(Dimension, {
          ...data,
          active: true,
        });
      }
    }
  }
}
