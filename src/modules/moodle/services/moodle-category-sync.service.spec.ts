import { Test, TestingModule } from '@nestjs/testing';
import { MoodleCategorySyncService } from './moodle-category-sync.service';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';

describe('MoodleCategorySyncService', () => {
  let service: MoodleCategorySyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleCategorySyncService,
        { provide: MoodleService, useValue: {} },
        { provide: UnitOfWork, useValue: {} },
      ],
    }).compile();

    service = module.get(MoodleCategorySyncService);
  });

  describe('parseSemesterCode', () => {
    it('should parse S22526 as Semester 2, 2025-2026 (Jan 20 – Jun 1 2026)', () => {
      const result = service['parseSemesterCode']('S22526');
      expect(result).toEqual({
        label: 'Semester 2',
        academicYear: '2025-2026',
        startDate: new Date(Date.UTC(2026, 0, 20)),
        endDate: new Date(Date.UTC(2026, 5, 1)),
      });
    });

    it('should parse S12425 as Semester 1, 2024-2025 (Aug 1 – Dec 18 2024)', () => {
      const result = service['parseSemesterCode']('S12425');
      expect(result).toEqual({
        label: 'Semester 1',
        academicYear: '2024-2025',
        startDate: new Date(Date.UTC(2024, 7, 1)),
        endDate: new Date(Date.UTC(2024, 11, 18)),
      });
    });

    it('should parse S32627 as Semester 3 intersession, 2026-2027 (Jun 15 – Jul 31 2027)', () => {
      const result = service['parseSemesterCode']('S32627');
      expect(result).toEqual({
        label: 'Semester 3',
        academicYear: '2026-2027',
        startDate: new Date(Date.UTC(2027, 5, 15)),
        endDate: new Date(Date.UTC(2027, 6, 31)),
      });
    });

    it('should place S1 before S2 within the same academic year', () => {
      const s1 = service['parseSemesterCode']('S12526');
      const s2 = service['parseSemesterCode']('S22526');
      expect(s1.startDate!.getTime()).toBeLessThan(s2.startDate!.getTime());
    });

    it('should return undefined for non-matching codes', () => {
      const result = service['parseSemesterCode']('INVALID');
      expect(result).toEqual({
        label: undefined,
        academicYear: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it('should return undefined for empty string', () => {
      const result = service['parseSemesterCode']('');
      expect(result).toEqual({
        label: undefined,
        academicYear: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it('should return undefined for partial match', () => {
      const result = service['parseSemesterCode']('S225');
      expect(result).toEqual({
        label: undefined,
        academicYear: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it('should return undefined for code with extra characters', () => {
      const result = service['parseSemesterCode']('S22526X');
      expect(result).toEqual({
        label: undefined,
        academicYear: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it('should return undefined for code without S prefix', () => {
      const result = service['parseSemesterCode']('X22526');
      expect(result).toEqual({
        label: undefined,
        academicYear: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });
  });
});
