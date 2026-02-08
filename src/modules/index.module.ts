import { ConfigModule } from '@nestjs/config';
import HealthModule from './health/health.module';
import MoodleModule from './moodle/moodle.module';
import { validateEnv } from '../configurations/index.config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from '../../mikro-orm.config';

export const ApplicationModules = [HealthModule, MoodleModule];

export const InfrastructureModules = [
  ConfigModule.forRoot({
    isGlobal: true,
    validate: validateEnv,
  }),
  MikroOrmModule.forRootAsync({ useFactory: () => config }),
];
