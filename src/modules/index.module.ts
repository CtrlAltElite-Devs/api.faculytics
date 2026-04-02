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
import { AnalyticsModule } from './analytics/analytics.module';
import { DimensionsModule } from './dimensions/dimensions.module';
import { FacultyModule } from './faculty/faculty.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { SemestersModule } from './semesters/semesters.module';
import { ReportsModule } from './reports/reports.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule } from 'nestjs-cls';
import type { StringValue } from 'ms';
import { v4 } from 'uuid';

const asJwtExpiresIn = (value: string): StringValue => value as StringValue;

export const ApplicationModules = [
  HealthModule,
  MoodleModule,
  AuthModule,
  ChatKitModule,
  EnrollmentsModule,
  QuestionnaireModule,
  AnalysisModule,
  AnalyticsModule,
  DimensionsModule,
  FacultyModule,
  CurriculumModule,
  AdminModule,
  AuditModule,
  SemestersModule,
  ReportsModule,
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
      expiresIn: asJwtExpiresIn(env.JWT_ACCESS_TOKEN_EXPIRY),
    },
  }),
  ClsModule.forRoot({
    global: true,
    middleware: { mount: true },
  }),
  ScheduleModule.forRoot(),
  BullModule.forRoot({ connection: { url: env.REDIS_URL } }),
  ThrottlerModule.forRootAsync({
    useFactory: () => ({
      throttlers: [
        {
          ttl: env.THROTTLE_TTL_SECONDS * 1000, // v6 uses milliseconds
          limit: env.THROTTLE_LIMIT,
        },
      ],
      storage: new ThrottlerStorageRedisService(env.REDIS_URL),
      errorMessage: 'Too Many Requests',
    }),
  }),
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
