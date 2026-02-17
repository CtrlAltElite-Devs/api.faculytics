import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { DimensionSeeder } from './dimension.seeder';
import { UserSeeder } from './user.seeder';
import { SystemConfigSeeder } from './system-config.seeder';

export class InfrastructureSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    await this.call(em, [DimensionSeeder, UserSeeder, SystemConfigSeeder]);
  }
}
