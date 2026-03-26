import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { QuestionnaireTypeSeeder } from './questionnaire-type.seeder';
import { DimensionSeeder } from './dimension.seeder';
import { UserSeeder } from './user.seeder';
import { SystemConfigSeeder } from './system-config.seeder';
import { QuestionnaireSeeder } from './questionnaire.seeder';

export class InfrastructureSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    await this.call(em, [
      QuestionnaireTypeSeeder,
      DimensionSeeder,
      UserSeeder,
      SystemConfigSeeder,
      QuestionnaireSeeder,
    ]);
  }
}
