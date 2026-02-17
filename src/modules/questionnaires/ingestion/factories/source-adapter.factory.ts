import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SourceType } from '../types/source-type.enum';
import { SourceAdapter } from '../interfaces/source-adapter.interface';
import { SOURCE_ADAPTER_PREFIX } from '../constants/ingestion.constants';

@Injectable()
export class SourceAdapterFactory {
  constructor(private readonly moduleRef: ModuleRef) {}

  Create<TPayload, TData>(type: SourceType): SourceAdapter<TPayload, TData> {
    const token = `${SOURCE_ADAPTER_PREFIX}${type}`;
    try {
      return this.moduleRef.get<SourceAdapter<TPayload, TData>>(token, {
        strict: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `No adapter found for source type: ${type}. Cause: ${message}`,
      );
    }
  }
}
