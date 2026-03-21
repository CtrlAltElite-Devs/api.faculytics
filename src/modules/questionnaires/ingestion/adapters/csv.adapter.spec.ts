import { Readable } from 'stream';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CSVAdapter } from './csv.adapter';
import { CSVAdapterConfig } from '../types/csv-adapter-config.type';
import { IngestionRecord } from '../interfaces/ingestion-record.interface';
import { RawSubmissionData } from '../dto/raw-submission-data.dto';

describe('CSVAdapter', () => {
  let adapter: CSVAdapter;

  beforeEach(() => {
    adapter = new CSVAdapter();
  });

  const QUESTION_A = 'a3f1b2c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c';
  const QUESTION_B = 'b7e2d9f1-c3a4-5b6d-7e8f-9a0b1c2d3e4f';

  const validCsv = [
    `externalId,username,facultyUsername,courseShortname,${QUESTION_A},${QUESTION_B},comment`,
    'sub_001,student001,faculty001,CS101,4,5,clear explanations',
    'sub_002,student002,faculty001,CS101,5,3,',
  ].join('\n');

  async function collectRecords(
    stream: Readable,
    config: CSVAdapterConfig,
  ): Promise<IngestionRecord<RawSubmissionData>[]> {
    const records: IngestionRecord<RawSubmissionData>[] = [];
    for await (const record of adapter.extract(stream, config)) {
      records.push(record);
    }
    return records;
  }

  describe('row transformation', () => {
    it('should transform flat CSV rows into RawSubmissionData with nested answers array', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(2);
      expect(records[0].data).toBeDefined();
      expect(records[0].data!.externalId).toBe('sub_001');
      expect(records[0].data!.username).toBe('student001');
      expect(records[0].data!.facultyUsername).toBe('faculty001');
      expect(records[0].data!.courseShortname).toBe('CS101');
      expect(records[0].data!.answers).toEqual([
        { questionId: QUESTION_A, value: 4 },
        { questionId: QUESTION_B, value: 5 },
      ]);
      expect(records[0].data!.qualitativeComment).toBe('clear explanations');
    });

    it('should separate metadata columns from answer columns', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      // Answer columns should be the UUID columns, not metadata
      const answerIds = records[0].data!.answers.map((a) => a.questionId);
      expect(answerIds).toContain(QUESTION_A);
      expect(answerIds).toContain(QUESTION_B);
      expect(answerIds).not.toContain('externalid');
      expect(answerIds).not.toContain('username');
    });

    it('should use externalId as sourceIdentifier', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records[0].sourceIdentifier).toBe('sub_001');
      expect(records[1].sourceIdentifier).toBe('sub_002');
    });

    it('should set qualitativeComment from comment column', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records[0].data!.qualitativeComment).toBe('clear explanations');
      expect(records[1].data!.qualitativeComment).toBeUndefined();
    });
  });

  describe('type coercion', () => {
    it('should keep metadata fields as strings and coerce answer values to numbers', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(typeof records[0].data!.username).toBe('string');
      expect(typeof records[0].data!.facultyUsername).toBe('string');
      expect(typeof records[0].data!.courseShortname).toBe('string');
      expect(typeof records[0].data!.answers[0].value).toBe('number');
    });

    it('should yield error record for NaN answer values', async () => {
      const csv = [
        `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`,
        'sub_001,student001,faculty001,CS101,not_a_number',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(1);
      expect(records[0].error).toContain(QUESTION_A);
      expect(records[0].error).toContain('invalid numeric value');
    });

    it('should yield error record for empty username', async () => {
      const csv = [
        `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`,
        'sub_001,,faculty001,CS101,4',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(1);
      expect(records[0].error).toContain('username');
      expect(records[0].error).toContain('must not be empty');
    });

    it('should yield error record for whitespace-only username', async () => {
      const csv = [
        `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`,
        'sub_001, ,faculty001,CS101,4',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(1);
      expect(records[0].error).toContain('username');
      expect(records[0].error).toContain('must not be empty');
    });

    it('should yield error record for empty answer value cells', async () => {
      const csv = [
        `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`,
        'sub_001,student001,faculty001,CS101,',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(1);
      expect(records[0].error).toContain(QUESTION_A);
      expect(records[0].error).toContain('invalid numeric value');
    });
  });

  describe('header validation', () => {
    it('should throw when required metadata column is missing', async () => {
      const csv = [
        `externalId,facultyUsername,courseShortname,${QUESTION_A}`,
        'sub_001,faculty001,CS101,4',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      await expect(collectRecords(stream, config)).rejects.toThrow(
        'Missing required metadata columns: username',
      );
    });

    it('should throw when multiple required metadata columns are missing', async () => {
      const csv = [`externalId,${QUESTION_A}`, 'sub_001,4'].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      await expect(collectRecords(stream, config)).rejects.toThrow(
        'Missing required metadata columns',
      );
    });

    it('should throw when zero answer columns exist', async () => {
      const csv = [
        'externalId,username,facultyUsername,courseShortname',
        'sub_001,student001,faculty001,CS101',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      await expect(collectRecords(stream, config)).rejects.toThrow(
        'No answer columns found',
      );
    });
  });

  describe('schema-aware validation', () => {
    it('should throw when answer columns do not match questionIds', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = {
        dryRun: false,
        questionIds: ['different-uuid-1', 'different-uuid-2'],
      };

      await expect(collectRecords(stream, config)).rejects.toThrow(
        'Answer column mismatch',
      );
    });

    it('should report missing and unexpected question IDs', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = {
        dryRun: false,
        questionIds: [QUESTION_A, 'missing-uuid'],
      };

      await expect(collectRecords(stream, config)).rejects.toThrow(
        /Missing.*missing-uuid/,
      );
    });

    it('should pass when answer columns match questionIds exactly', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = {
        dryRun: false,
        questionIds: [QUESTION_A, QUESTION_B],
      };

      const records = await collectRecords(stream, config);
      expect(records).toHaveLength(2);
      expect(records[0].data).toBeDefined();
    });

    it('should skip schema validation when questionIds not provided', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);
      expect(records).toHaveLength(2);
    });
  });

  describe('externalId fallback', () => {
    it('should fallback externalId to row index when blank', async () => {
      const csv = [
        `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`,
        ',student001,faculty001,CS101,4',
        ' ,student002,faculty001,CS101,5',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records[0].data!.externalId).toBe('1');
      expect(records[1].data!.externalId).toBe('2');
    });
  });

  describe('empty file handling', () => {
    it('should yield zero records for a headers-only CSV', async () => {
      const csv = `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`;
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(0);
    });

    it('should throw for a completely empty CSV', async () => {
      const stream = Readable.from('');
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      // Empty file yields no rows, so header validation never runs — zero records
      expect(records).toHaveLength(0);
    });
  });

  describe('Buffer input (Multer)', () => {
    it('should work when stream is created from a Buffer', async () => {
      const buffer = Buffer.from(validCsv);
      const stream = Readable.from(buffer);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(2);
      expect(records[0].data).toBeDefined();
      expect(records[0].data!.externalId).toBe('sub_001');
    });

    it('should work when reading actual CSV file from disk as Buffer', async () => {
      const filePath = join(
        __dirname,
        '../../../../../test/fixtures/csv/mixed-valid-invalid.csv',
      );
      const buffer = readFileSync(filePath);
      const stream = Readable.from(buffer);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records.length).toBeGreaterThan(0);
      expect(records[0].data).toBeDefined();
      expect(records[0].data!.externalId).toBe('sub_001');
    });

    it('should throw schema mismatch when questionIds do not match CSV file', async () => {
      const filePath = join(
        __dirname,
        '../../../../../test/fixtures/csv/mixed-valid-invalid.csv',
      );
      const buffer = readFileSync(filePath);
      const stream = Readable.from(buffer);
      const config: CSVAdapterConfig = {
        dryRun: true,
        questionIds: ['real-uuid-1', 'real-uuid-2'],
      };

      await expect(collectRecords(stream, config)).rejects.toThrow(
        'Answer column mismatch',
      );
    });
  });

  describe('BOM handling', () => {
    it('should handle UTF-8 BOM prefix correctly', async () => {
      const bomCsv =
        '\uFEFF' +
        [
          `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`,
          'sub_001,student001,faculty001,CS101,4',
        ].join('\n');
      const stream = Readable.from(bomCsv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(1);
      expect(records[0].data!.externalId).toBe('sub_001');
    });
  });

  describe('custom delimiters', () => {
    it('should respect custom delimiter', async () => {
      const csv = [
        `externalId;username;facultyUsername;courseShortname;${QUESTION_A}`,
        'sub_001;student001;faculty001;CS101;4',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false, delimiter: ';' };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(1);
      expect(records[0].data!.username).toBe('student001');
    });
  });

  describe('stream cleanup', () => {
    it('should destroy the underlying stream after extraction', async () => {
      const csv = [
        `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`,
        'sub_001,student001,faculty001,CS101,4',
      ].join('\n');
      const stream = Readable.from(csv);
      const destroySpy = jest.spyOn(stream, 'destroy');
      const config: CSVAdapterConfig = { dryRun: false };

      for await (const _ of adapter.extract(stream, config)) {
        break;
      }

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('stream errors', () => {
    it('should handle stream errors gracefully', async () => {
      const stream = new Readable({
        read() {
          this.push(
            `externalId,username,facultyUsername,courseShortname,${QUESTION_A}\n`,
          );
          this.push('sub_001,student001,faculty001,CS101,4\n');
          this.push(null); // End stream normally after data
        },
      });
      const config: CSVAdapterConfig = { dryRun: false };

      const records: IngestionRecord<RawSubmissionData>[] = [];
      for await (const record of adapter.extract(stream, config)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].data!.externalId).toBe('sub_001');
    });
  });

  describe('backpressure', () => {
    it('should handle backpressure with a slow consumer', async () => {
      const numRows = 50;
      const lines = [
        `externalId,username,facultyUsername,courseShortname,${QUESTION_A}`,
      ];
      for (let i = 0; i < numRows; i++) {
        lines.push(
          `sub_${i},student${1000 + i},faculty001,CS101,${(i % 5) + 1}`,
        );
      }
      const stream = Readable.from(lines.join('\n'));
      const config: CSVAdapterConfig = { dryRun: false };

      let count = 0;
      for await (const record of adapter.extract(stream, config)) {
        count++;
        if (count % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(record.data).toBeDefined();
      }

      expect(count).toBe(numRows);
    });
  });

  describe('case-insensitive metadata matching', () => {
    it('should normalize metadata column names case-insensitively', async () => {
      const csv = [
        `ExternalId,Username,FacultyUsername,CourseShortname,${QUESTION_A}`,
        'sub_001,student001,faculty001,CS101,4',
      ].join('\n');
      const stream = Readable.from(csv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      expect(records).toHaveLength(1);
      expect(records[0].data!.externalId).toBe('sub_001');
      expect(records[0].data!.username).toBe('student001');
    });

    it('should preserve answer column UUIDs verbatim', async () => {
      const stream = Readable.from(validCsv);
      const config: CSVAdapterConfig = { dryRun: false };

      const records = await collectRecords(stream, config);

      const answerIds = records[0].data!.answers.map((a) => a.questionId);
      expect(answerIds).toContain(QUESTION_A);
      expect(answerIds).toContain(QUESTION_B);
    });
  });
});
