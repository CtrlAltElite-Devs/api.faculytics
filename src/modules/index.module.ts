import { ConfigModule } from '@nestjs/config';
import { env, validateEnv } from '../configurations/index.config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from '../../mikro-orm.config';
import { JwtModule } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { CacheModule, CacheOptions } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { BullModule } from '@nestjs/bullmq';
import AuthModule from './auth/auth.module';
import HealthModule from './health/health.module';
import MoodleModule from './moodle/moodle.module';
import { PassportModule } from '@nestjs/passport';
import { ChatKitModule } from './chat-kit/chat-kit.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { ScheduleModule } from '@nestjs/schedule';
import { QuestionnaireModule } from './questionnaires/questionnaires.module';
import { AnalysisModule } from './analysis/analysis.module';
import { DimensionsModule } from './dimensions/dimensions.module';
import { FacultyModule } from './faculty/faculty.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule } from 'nestjs-cls';
import { v4 } from 'uuid';

export const ApplicationModules = [
  HealthModule,
  MoodleModule,
  AuthModule,
  ChatKitModule,
  EnrollmentsModule,
  QuestionnaireModule,
  AnalysisModule,
  DimensionsModule,
  FacultyModule,
  CurriculumModule,
];

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
  ClsModule.forRoot({
    global: true,
    middleware: { mount: true },
  }),
  ScheduleModule.forRoot(),
  BullModule.forRoot({ connection: { url: env.REDIS_URL } }),
  CacheModule.registerAsync({
    isGlobal: true,
    useFactory: (): CacheOptions => {
      const logger = new Logger('CacheModule');

      logger.log(
        `Connecting to Redis at ${env.REDIS_URL.replace(/\/\/.*@/, '//***@')}`,
      );
      const store = new KeyvRedis(env.REDIS_URL, {
        keyPrefixSeparator: '',
        namespace: env.REDIS_KEY_PREFIX,
      });
      logger.log('Redis cache store configured');

      return { stores: [store], ttl: env.REDIS_CACHE_TTL * 1000 };
    },
  }),
  LoggerModule.forRoot({
    pinoHttp: {
      level: env.NODE_ENV !== 'production' ? 'debug' : 'info',
      transport:
        env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
            }
          : undefined,

      genReqId: (req) => {
        return req.headers['x-request-id'] || v4();
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
    },
    exclude: ['/api/v1/health'],
  }),
];
