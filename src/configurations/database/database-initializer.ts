import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';

export default async function InitializeDatabase(app: INestApplication<any>) {
  try {
    await migrate(app);
    // await seed(app);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.error(error);
    process.exit(1);
  }
}

async function migrate(app: INestApplication<any>) {
  const orm = app.get(MikroORM);
  const migrator = orm.getMigrator();
  const migrationResult = await migrator.up();
  console.log('migration result: ', JSON.stringify(migrationResult, null, 3));
}
