import { ConfigModule } from '@nestjs/config';
import { env, validateEnv } from '../configurations/index.config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from '../../mikro-orm.config';
import { JwtModule } from '@nestjs/jwt';
import AuthModule from './auth/auth.module';
import HealthModule from './health/health.module';
import MoodleModule from './moodle/moodle.module';
import { PassportModule } from '@nestjs/passport';

export const ApplicationModules = [HealthModule, MoodleModule, AuthModule];

export const InfrastructureModules = [
  ConfigModule.forRoot({
    isGlobal: true,
    validate: validateEnv,
  }),
  PassportModule.register({ defaultStrategy: 'jwt' }),
  MikroOrmModule.forRootAsync({ useFactory: () => config }),
  JwtModule.register({
    global: true,
    secret: env.JWT_SECRET,
    signOptions: {
      expiresIn: '300s',
    },
  }),
];
