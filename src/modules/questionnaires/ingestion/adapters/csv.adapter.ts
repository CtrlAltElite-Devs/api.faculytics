import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { IngestionRecord } from '../interfaces/ingestion-record.interface';
import { BaseStreamAdapter } from './base-stream.adapter';
import { CSVAdapterConfig } from '../types/csv-adapter-config.type';
import {
  RawSubmissionData,
  RawAnswerData,
} from '../dto/raw-submission-data.dto';

const METADATA_COLUMNS = new Set([
  'externalid',
  'username',
  'facultyusername',
  'courseshortname',
  'submittedat',
  'comment',
]);

const REQUIRED_METADATA = [
  'externalid',
  'username',
  'facultyusername',
  'courseshortname',
];

@Injectable()
export class CSVAdapter extends BaseStreamAdapter<
  NodeJS.ReadableStream,
  RawSubmissionData
> {
  async *extract(
    payload: NodeJS.ReadableStream,
    config: CSVAdapterConfig,
  ): AsyncIterable<IngestionRecord<RawSubmissionData>> {
    let answerColumnHeaders: string[] = [];
    let headersValidated = false;

    const parser = parse({
      delimiter: config.delimiter ?? config.separator ?? ',',
      quote: config.quote ?? '"',
      escape: config.escape ?? '"',
      bom: true,
      skip_empty_lines: true,
      max_record_size: 65536,
      trim: true,
      columns: (headers: string[]) => {
        return headers.map((h) => {
          const trimmed = h.trim();
          const normalized = trimmed.toLowerCase().replace(/[^a-z0-9_-]/g, '');
          return METADATA_COLUMNS.has(normalized) ? normalized : trimmed;
        });
      },
      cast: (value: string, context) => {
        if (context.header) return value;
        if (value.trim() === '') return value;

        const column = context.column as string;
        const normalized = column.toLowerCase().replace(/[^a-z0-9_-]/g, '');

        // Answer columns get numeric coercion; all metadata columns stay as strings
        if (!METADATA_COLUMNS.has(normalized)) {
          const num = Number(value);
          return isNaN(num) ? value : num;
        }

        return value;
      },
    });

    const readable =
      payload instanceof Readable
        ? payload
        : Readable.from(payload as AsyncIterable<unknown>);
    readable.on('error', (err: Error) => parser.destroy(err));
    readable.pipe(parser);

    let rowIndex = 0;

    try {
      for await (const row of parser as AsyncIterable<
        Record<string, unknown>
      >) {
        // Validate headers on first row
        if (!headersValidated) {
          const columnNames = Object.keys(row);
          const normalizedColumnNames = columnNames.map((c) =>
            c.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
          );

          // Check required metadata columns
          const missingMetadata = REQUIRED_METADATA.filter(
            (req) => !normalizedColumnNames.includes(req),
          );
          if (missingMetadata.length > 0) {
            throw new Error(
              `Missing required metadata columns: ${missingMetadata.join(', ')}`,
            );
          }

          // Identify answer columns (non-metadata)
          answerColumnHeaders = columnNames.filter(
            (c) =>
              !METADATA_COLUMNS.has(
                c.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
              ),
          );
          if (answerColumnHeaders.length === 0) {
            throw new Error(
              'No answer columns found. All columns are metadata columns.',
            );
          }

          // Schema-aware validation
          const questionIds = config.questionIds;
          if (questionIds) {
            const expected = new Set(questionIds);
            const found = new Set(answerColumnHeaders);
            const missing = questionIds.filter((id) => !found.has(id));
            const extra = answerColumnHeaders.filter((id) => !expected.has(id));

            if (missing.length > 0 || extra.length > 0) {
              const parts: string[] = [];
              if (missing.length > 0) {
                parts.push(`Missing: ${missing.join(', ')}`);
              }
              if (extra.length > 0) {
                parts.push(`Unexpected: ${extra.join(', ')}`);
              }
              throw new Error(
                `Answer column mismatch with questionnaire schema. ${parts.join('. ')}`,
              );
            }
          }

          headersValidated = true;
        }

        rowIndex++;

        // Post-coercion validation
        const username = ((row['username'] ?? '') as string).trim();
        const facultyUsername = (
          (row['facultyusername'] ?? '') as string
        ).trim();
        const courseShortname = (
          (row['courseshortname'] ?? '') as string
        ).trim();

        const validationErrors: string[] = [];

        if (!username) {
          validationErrors.push('username: must not be empty');
        }
        if (!facultyUsername) {
          validationErrors.push('facultyUsername: must not be empty');
        }
        if (!courseShortname) {
          validationErrors.push('courseShortname: must not be empty');
        }

        // Validate answer values
        const answers: RawAnswerData[] = [];
        for (const header of answerColumnHeaders) {
          const value = row[header];
          if (typeof value !== 'number' || !isFinite(value)) {
            validationErrors.push(
              `answer "${header}": invalid numeric value "${String(value)}"`,
            );
          } else {
            answers.push({ questionId: header, value });
          }
        }

        if (validationErrors.length > 0) {
          yield {
            error: `Validation errors: ${validationErrors.join('; ')}`,
            sourceIdentifier:
              String((row['externalid'] as string) ?? '') || String(rowIndex),
          };
          continue;
        }

        // Build RawSubmissionData
        const rawExternalId = row['externalid'] as string | undefined;
        const externalId =
          rawExternalId != null && rawExternalId.trim() !== ''
            ? rawExternalId
            : String(rowIndex);

        const rawSubmission: RawSubmissionData = {
          externalId,
          username,
          facultyUsername,
          courseShortname,
          answers,
        };

        // Optional fields
        const rawComment = row['comment'] as string | undefined;
        if (rawComment != null && rawComment.trim() !== '') {
          rawSubmission.qualitativeComment = rawComment;
        }

        const rawSubmittedAt = row['submittedat'] as string | undefined;
        if (rawSubmittedAt != null && rawSubmittedAt.trim() !== '') {
          rawSubmission.submittedAt = rawSubmittedAt;
        }

        yield {
          data: rawSubmission,
          sourceIdentifier: externalId,
        };
      }
    } catch (error: any) {
      // If headers weren't validated yet, this is a fatal error (rethrow)
      if (!headersValidated) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      yield {
        error: error instanceof Error ? error.message : String(error),
        sourceIdentifier: String(rowIndex + 1),
      };
    } finally {
      this.cleanupStream(payload);
      parser.destroy();
    }
  }
}
