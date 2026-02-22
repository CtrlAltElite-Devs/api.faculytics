import pino from 'pino';
import { PinoLogger } from 'nestjs-pino';
import type {
  Logger,
  LoggerNamespace,
  LogContext,
  LoggerOptions,
} from '@mikro-orm/core';
import { env } from '../env';

const fallbackLogger = pino({
  level: env.NODE_ENV !== 'production' ? 'debug' : 'info',
  transport:
    env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

function getLogger(): pino.Logger {
  return PinoLogger.root ?? fallbackLogger;
}

export class MikroOrmPinoLogger implements Logger {
  private debugMode: boolean | LoggerNamespace[] = false;
  private readonly isProduction: boolean;

  constructor(options?: LoggerOptions) {
    this.debugMode = options?.debugMode ?? false;
    this.isProduction = env.NODE_ENV === 'production';
  }

  log(namespace: LoggerNamespace, message: string, context?: LogContext): void {
    if (!this.isEnabled(namespace, context)) return;

    const logData = this.buildLogData(namespace, message, context);

    const logger = getLogger();
    switch (namespace) {
      case 'query':
      case 'query-params':
        logger.debug(logData, message);
        break;
      case 'schema':
      case 'discovery':
      case 'info':
        logger.info(logData, message);
        break;
      case 'deprecated':
        logger.warn(logData, message);
        break;
      default:
        logger.debug(logData, message);
    }
  }

  error(
    namespace: LoggerNamespace,
    message: string,
    context?: LogContext,
  ): void {
    const logData = this.buildLogData(namespace, message, context);
    getLogger().error(logData, message);
  }

  warn(
    namespace: LoggerNamespace,
    message: string,
    context?: LogContext,
  ): void {
    const logData = this.buildLogData(namespace, message, context);
    getLogger().warn(logData, message);
  }

  logQuery(context: LogContext): void {
    if (!this.isEnabled('query', context)) return;

    const logData: Record<string, unknown> = {
      orm: 'mikro-orm',
      namespace: 'query',
      query: context.query,
      took: context.took,
      results: context.results,
      affected: context.affected,
    };

    if (context.label) {
      logData.label = context.label;
    }

    if (context.connection) {
      logData.connection = context.connection;
    }

    if (!this.isProduction && context.params?.length) {
      logData.params = context.params;
    }

    const message = context.label
      ? `[${context.label}] ${context.query}`
      : context.query;

    getLogger().debug(logData, message);
  }

  setDebugMode(debugMode: boolean | LoggerNamespace[]): void {
    this.debugMode = debugMode;
  }

  isEnabled(namespace: LoggerNamespace, context?: LogContext): boolean {
    const debugMode = context?.debugMode ?? this.debugMode;

    if (context?.enabled === false) {
      return false;
    }

    if (debugMode === true) {
      return true;
    }

    if (Array.isArray(debugMode)) {
      return debugMode.includes(namespace);
    }

    return false;
  }

  private buildLogData(
    namespace: LoggerNamespace,
    _message: string,
    context?: LogContext,
  ): Record<string, unknown> {
    const logData: Record<string, unknown> = {
      orm: 'mikro-orm',
      namespace,
    };

    if (context?.label) {
      logData.label = context.label;
    }

    if (context?.connection) {
      logData.connection = context.connection;
    }

    return logData;
  }
}

export function createMikroOrmLogger(options: LoggerOptions): Logger {
  return new MikroOrmPinoLogger(options);
}
