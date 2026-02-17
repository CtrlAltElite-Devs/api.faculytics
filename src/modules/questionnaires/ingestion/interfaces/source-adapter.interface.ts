import { SourceConfiguration } from '../types/source-config.type';
import { IngestionRecord } from './ingestion-record.interface';

export interface SourceAdapter<TPayload, TData = unknown> {
  extract(
    payload: TPayload,
    config: SourceConfiguration,
  ): AsyncIterable<IngestionRecord<TData>>;
  close?(): Promise<void>;
}
