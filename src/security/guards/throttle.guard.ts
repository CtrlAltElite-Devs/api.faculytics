import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(CustomThrottlerGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throw error; // Re-throw legitimate 429s
      }
      this.logger.warn(
        `Rate limiter unavailable, allowing request: ${error instanceof Error ? error.message : error}`,
      );
      return true; // Fail open — allow request if Redis is down
    }
  }
}
