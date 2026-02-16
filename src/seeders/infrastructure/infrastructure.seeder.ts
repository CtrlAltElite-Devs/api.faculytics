import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { DimensionSeeder } from './dimension.seeder';

export class InfrastructureSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    await this.call(em, [DimensionSeeder]);
  }
}
