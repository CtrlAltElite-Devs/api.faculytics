import { ConsoleLogger, NestApplicationOptions } from '@nestjs/common';

export function useNestFactoryCustomOptions(): NestApplicationOptions {
  return {
    logger: new ConsoleLogger({
      prefix: 'FACL',
    }),
  };
}
