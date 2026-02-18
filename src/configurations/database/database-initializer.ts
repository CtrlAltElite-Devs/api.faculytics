import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import DatabaseSeeder from '../../seeders/index.seeder';
import { env } from '../env';

export default async function InitializeDatabase(app: INestApplication<any>) {
  try {
    if (env.OPENAPI_MODE) return;
    await migrate(app);
    await seed(app);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.error(error);
    process.exit(1);
  }
}

async function migrate(app: INestApplication<any>) {
  const orm = app.get(MikroORM);
  const migrator = orm.migrator;
  const migrationResult = await migrator.up();
  console.log('migration result: ', JSON.stringify(migrationResult, null, 3));
}

async function seed(app: INestApplication<any>) {
  const orm = app.get(MikroORM);
  await orm.seeder.seed(DatabaseSeeder);
}
