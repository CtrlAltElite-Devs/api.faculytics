import { env } from './src/configurations/index.config';
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { SeedManager } from '@mikro-orm/seeder';
import { entities } from './src/entities/index.entity';
import { createMikroOrmLogger } from './src/configurations/logger/mikro-orm-logger';

const getConnectionStrategy = () => {
  const isNeon = env.DATABASE_URL.includes('neon.tech');
  if (isNeon) {
    return {
      ssl: {
        rejectUnauthorized: false, // required for Neon
      },
    };
  }

  return {
    ssl: false,
  };
};

export default defineConfig({
  driver: PostgreSqlDriver,
  clientUrl: env.DATABASE_URL,
  entities: entities,
  extensions: [Migrator, SeedManager],
  driverOptions: {
    connection: getConnectionStrategy(),
  },
  debug: env.NODE_ENV === 'development' ? ['query', 'query-params'] : false,
  loggerFactory: createMikroOrmLogger,
  migrations: {
    path: 'dist/src/migrations',
    pathTs: 'src/migrations',
  },
  seeder: {
    path: 'dist/src/seeders',
    pathTs: 'src/seeders',
  },
  filters: {
    softDelete: {
      cond: { deletedAt: null },
      default: true,
    },
  },
});
