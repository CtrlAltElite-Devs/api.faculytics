import { BadRequestException } from '@nestjs/common';
import { MoodleCsvParserService } from './moodle-csv-parser.service';

describe('MoodleCsvParserService', () => {
  let service: MoodleCsvParserService;

  beforeEach(() => {
    service = new MoodleCsvParserService();
  });

  it('should parse valid CSV with 4 required columns', () => {
    const csv = Buffer.from(
      'Course Code,Descriptive Title,Program,Semester\nCS101,Intro to CS,BSCS,1\nCS102,Data Structures,BSCS,2',
    );
    const result = service.Parse(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      courseCode: 'CS101',
      descriptiveTitle: 'Intro to CS',
      program: 'BSCS',
      semester: '1',
    });
    expect(result.errors).toHaveLength(0);
  });

  it('should ignore extra columns', () => {
    const csv = Buffer.from(
      'Course Code,Descriptive Title,Program,Semester,Units,Type\nCS101,Intro to CS,BSCS,1,3,Major',
    );
    const result = service.Parse(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].courseCode).toBe('CS101');
  });

  it('should throw on missing required header', () => {
    const csv = Buffer.from('Course Code,Program,Semester\nCS101,BSCS,1');
    expect(() => service.Parse(csv)).toThrow(BadRequestException);
    expect(() => service.Parse(csv)).toThrow(
      'Missing required CSV headers: Descriptive Title',
    );
  });

  it('should flag empty required fields per row', () => {
    const csv = Buffer.from(
      'Course Code,Descriptive Title,Program,Semester\nCS101,,BSCS,1',
    );
    const result = service.Parse(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowNumber).toBe(2);
    expect(result.errors[0].message).toContain('Descriptive Title');
  });

  it('should flag semester-0 rows as warnings', () => {
    const csv = Buffer.from(
      'Course Code,Descriptive Title,Program,Semester\nCS-EL,Elective,BSCS,0',
    );
    const result = service.Parse(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toContain('No semester assigned');
  });

  it('should trim whitespace in headers', () => {
    const csv = Buffer.from(
      ' Course Code , Descriptive Title , Program , Semester \nCS101,Intro to CS,BSCS,1',
    );
    const result = service.Parse(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].courseCode).toBe('CS101');
  });

  it('should return empty arrays for headers-only CSV', () => {
    const csv = Buffer.from('Course Code,Descriptive Title,Program,Semester\n');
    const result = service.Parse(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
