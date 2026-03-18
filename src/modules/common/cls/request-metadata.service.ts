import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { RequestMetadata } from '../interceptors/http/enriched-request';

@Injectable()
export class RequestMetadataService {
  constructor(private readonly cls: ClsService) {}

  get(): RequestMetadata | null {
    return this.cls.get('requestMetadata') ?? null;
  }

  getOrFail(): RequestMetadata {
    const meta = this.get();
    if (!meta) throw new Error('RequestMetadata not available in CLS context');
    return meta;
  }

  set(metadata: RequestMetadata): void {
    this.cls.set('requestMetadata', metadata);
  }
}
