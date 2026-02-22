import { Injectable } from '@nestjs/common';
import * as Excel from 'exceljs';
import type { Stream } from 'stream';
import { IngestionRecord } from '../interfaces/ingestion-record.interface';
import { BaseStreamAdapter } from './base-stream.adapter';
import { ExcelAdapterConfig } from '../types/excel-adapter-config.type';

@Injectable()
export class ExcelAdapter extends BaseStreamAdapter<NodeJS.ReadableStream> {
  async *extract(
    payload: NodeJS.ReadableStream,
    config: ExcelAdapterConfig,
  ): AsyncIterable<IngestionRecord<unknown>> {
    const workbookReader = new Excel.stream.xlsx.WorkbookReader(
      payload as unknown as Stream,
      {
        entries: 'emit',
        sharedStrings: 'cache',
        styles: 'ignore',
        hyperlinks: 'ignore',
      },
    );

    const targetSheet = config.sheetName || config.sheetIndex || 1;
    let currentSheetIndex = 0;
    const existingKeys = new Set<string>();
    let headers: string[] = [];

    try {
      for await (const worksheetReader of workbookReader) {
        currentSheetIndex++;

        const worksheetName = (worksheetReader as { name?: string }).name;
        const isTarget =
          typeof targetSheet === 'string'
            ? worksheetName === targetSheet
            : currentSheetIndex === targetSheet;

        if (!isTarget) {
          // We must consume the worksheet reader even if we don't use it
          // to move the workbook reader forward.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of worksheetReader) {
            // Skip
          }
          continue;
        }

        let dataRowIndex = 0;
        for await (const row of worksheetReader) {
          // exceljs row numbers are 1-based.
          if (row.number === 1) {
            const rawValues: unknown[] = Array.isArray(row.values)
              ? row.values
              : [];
            // row.values is 1-indexed in exceljs
            const headerValues: string[] = rawValues.slice(1).map(String);
            headers = headerValues.map((h, i) =>
              this.normalizeKey(h, existingKeys, `column_${i + 1}`),
            );
            continue;
          }

          dataRowIndex++;
          const rowData: Record<string, unknown> = {};
          const rawValues = Array.isArray(row.values) ? row.values : [];
          const values = rawValues.slice(1);

          headers.forEach((header, index) => {
            if (header) {
              rowData[header] =
                values[index] !== undefined ? values[index] : null;
            }
          });

          yield {
            data: rowData,
            sourceIdentifier: dataRowIndex,
          };
        }

        // After processing the target sheet, we can stop if we want,
        // but it's safer to let the loop finish or break.
        break;
      }
    } catch (error) {
      yield {
        error: error instanceof Error ? error.message : String(error),
        sourceIdentifier: 'workbook',
      };
    } finally {
      this.cleanupStream(payload);
    }
  }
}
