import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { UAParser } from 'ua-parser-js';
import { EnrichedRequest } from './http/enriched-request';

@Injectable()
export class MetaDataInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetaDataInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler<any>) {
    const request: EnrichedRequest = context.switchToHttp().getRequest();
    const { method, url, headers, socket } = request;

    // Parse user-agent
    const parser = new UAParser(headers['user-agent']);
    const uaResult = parser.getResult();

    // Extract IP address
    const forwarded = headers['x-forwarded-for'] as string;
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : socket.remoteAddress;

    request.metaData = {
      browserName: uaResult.browser.name ?? '',
      os: uaResult.os.name ?? '',
      ipAddress: ip ?? '',
    };

    // 🔹 Clear, structured logging
    this.logger.log(
      `Metadata captured for [${method}] ${url} -> ` +
        `IP="${request.metaData.ipAddress}", ` +
        `Browser="${request.metaData.browserName}", ` +
        `OS="${request.metaData.os}"`,
    );

    // Optional detailed debug log
    this.logger.debug(`UA full parse result: ${JSON.stringify(uaResult)}`);

    return next.handle();
  }
}
