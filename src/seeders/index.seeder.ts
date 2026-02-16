import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { InfrastructureSeeder } from './infrastructure/infrastructure.seeder';

export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    await this.call(em, [InfrastructureSeeder]);
  }
}

export default DatabaseSeeder;
