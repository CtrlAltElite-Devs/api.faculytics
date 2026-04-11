import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { CurriculumRow, ParseError } from '../lib/provisioning.types';

const REQUIRED_HEADERS = [
  'Course Code',
  'Descriptive Title',
  'Program',
  'Semester',
] as const;

const HEADER_MAP: Record<string, keyof CurriculumRow> = {
  'course code': 'courseCode',
  'descriptive title': 'descriptiveTitle',
  program: 'program',
  semester: 'semester',
};

export interface CsvParseResult {
  rows: CurriculumRow[];
  warnings: { rowNumber: number; courseCode: string; reason: string }[];
  errors: ParseError[];
}

@Injectable()
export class MoodleCsvParserService {
  Parse(buffer: Buffer): CsvParseResult {
    const records: Record<string, string>[] = parse(buffer, {
      columns: (headers: string[]) => headers.map((h) => h.trim()),
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });

    if (records.length === 0) {
      return { rows: [], warnings: [], errors: [] };
    }

    const headers = Object.keys(records[0]);
    this.validateHeaders(headers);

    const rows: CurriculumRow[] = [];
    const warnings: CsvParseResult['warnings'] = [];
    const errors: ParseError[] = [];

    for (let i = 0; i < records.length; i++) {
      const rowNumber = i + 2; // 1-based + header row
      const record = records[i];

      const mapped = this.mapRecord(record);
      const missing = this.findMissingFields(mapped);

      if (missing.length > 0) {
        errors.push({
          rowNumber,
          message: `Empty required field(s): ${missing.join(', ')}`,
        });
        continue;
      }

      if (mapped.semester === '0') {
        warnings.push({
          rowNumber,
          courseCode: mapped.courseCode,
          reason: 'No semester assigned — use Quick Course Create',
        });
        continue;
      }

      rows.push(mapped);
    }

    return { rows, warnings, errors };
  }

  private validateHeaders(headers: string[]) {
    const normalized = headers.map((h) => h.toLowerCase().trim());
    const missing = REQUIRED_HEADERS.filter(
      (req) => !normalized.includes(req.toLowerCase()),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required CSV headers: ${missing.join(', ')}`,
      );
    }
  }

  private mapRecord(record: Record<string, string>): CurriculumRow {
    const result: Partial<CurriculumRow> = {};
    for (const [header, value] of Object.entries(record)) {
      const key = HEADER_MAP[header.toLowerCase().trim()];
      if (key) {
        result[key] = value.trim();
      }
    }
    return result as CurriculumRow;
  }

  private findMissingFields(row: CurriculumRow): string[] {
    const missing: string[] = [];
    if (!row.courseCode) missing.push('Course Code');
    if (!row.descriptiveTitle) missing.push('Descriptive Title');
    if (!row.program) missing.push('Program');
    if (!row.semester && row.semester !== '0') missing.push('Semester');
    return missing;
  }
}
