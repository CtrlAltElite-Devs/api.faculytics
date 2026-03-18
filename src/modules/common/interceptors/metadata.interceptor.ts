import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import { RequestMetadataService } from '../cls/request-metadata.service';

@Injectable()
export class MetaDataInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetaDataInterceptor.name);

  constructor(
    private readonly requestMetadataService: RequestMetadataService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler<any>) {
    const request: Request = context.switchToHttp().getRequest();
    const { method, url, headers, socket } = request;

    // Parse user-agent
    const parser = new UAParser(headers['user-agent']);
    const uaResult = parser.getResult();

    // Extract IP address
    const forwarded = headers['x-forwarded-for'] as string;
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : socket.remoteAddress;

    const metadata = {
      browserName: uaResult.browser.name ?? '',
      os: uaResult.os.name ?? '',
      ipAddress: ip ?? '',
    };

    this.requestMetadataService.set(metadata);

    // 🔹 Clear, structured logging
    this.logger.log(
      `Metadata captured for [${method}] ${url} -> ` +
        `IP="${metadata.ipAddress}", ` +
        `Browser="${metadata.browserName}", ` +
        `OS="${metadata.os}"`,
    );

    // Optional detailed debug log
    this.logger.debug(`UA full parse result: ${JSON.stringify(uaResult)}`);

    return next.handle();
  }
}
