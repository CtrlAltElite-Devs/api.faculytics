import { Injectable } from '@nestjs/common';
import csv from 'csv-parser';
import { IngestionRecord } from '../interfaces/ingestion-record.interface';
import { BaseStreamAdapter } from './base-stream.adapter';
import { CSVAdapterConfig } from '../types/csv-adapter-config.type';

@Injectable()
export class CSVAdapter extends BaseStreamAdapter<NodeJS.ReadableStream> {
  async *extract(
    payload: NodeJS.ReadableStream,
    config: CSVAdapterConfig,
  ): AsyncIterable<IngestionRecord<unknown>> {
    const existingKeys = new Set<string>();

    let headerCount = 0;
    type CsvParserOptions = NonNullable<
      Exclude<Parameters<typeof csv>[0], ReadonlyArray<string>>
    >;

    const csvOptions: CsvParserOptions = {
      separator: config.delimiter ?? config.separator ?? ',',
      quote: config.quote ?? '"',
      escape: config.escape ?? '"',
      mapHeaders: ({ header, index }) => {
        headerCount++;
        return this.normalizeKey(header, existingKeys, `column_${index + 1}`);
      },
    };
    const parser = csv(csvOptions);
    const rowIterable = parser as AsyncIterable<Record<string, unknown>>;

    payload.on('error', (err: Error) => parser.destroy(err));
    payload.pipe(parser);

    let rowIndex = 0;

    try {
      for await (const row of rowIterable) {
        rowIndex++;

        const columnCount = Object.keys(row).length;
        if (columnCount !== headerCount) {
          yield {
            error: `Column count mismatch: expected ${headerCount}, got ${columnCount}`,
            sourceIdentifier: rowIndex,
          };
          continue;
        }

        yield {
          data: row,
          sourceIdentifier: rowIndex,
        };
      }
    } catch (error: any) {
      yield {
        error: error instanceof Error ? error.message : String(error),
        sourceIdentifier: rowIndex + 1,
      };
    } finally {
      this.cleanupStream(payload);
      parser.destroy();
    }
  }
}
