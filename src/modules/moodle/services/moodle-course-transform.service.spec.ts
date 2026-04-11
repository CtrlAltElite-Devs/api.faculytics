import { MoodleCourseTransformService } from './moodle-course-transform.service';

describe('MoodleCourseTransformService', () => {
  let service: MoodleCourseTransformService;

  beforeEach(() => {
    service = new MoodleCourseTransformService();
  });

  describe('GenerateShortname', () => {
    it('should produce correct format for semester 1', () => {
      const result = service.GenerateShortname(
        'UCMN',
        '1',
        '25',
        '26',
        'CS101',
      );
      expect(result).toMatch(/^UCMN-S12526-CS101-\d{5}$/);
    });

    it('should produce correct format for semester 2', () => {
      const result = service.GenerateShortname(
        'UCMN',
        '2',
        '25',
        '26',
        'CS102',
      );
      expect(result).toMatch(/^UCMN-S22526-CS102-\d{5}$/);
    });

    it('should strip spaces from course code', () => {
      const result = service.GenerateShortname(
        'UCMN',
        '1',
        '25',
        '26',
        'BSCS 101',
      );
      expect(result).toMatch(/^UCMN-S12526-BSCS101-\d{5}$/);
    });

    it('should produce 5-digit zero-padded EDP code', () => {
      const result = service.GenerateShortname(
        'UCMN',
        '1',
        '25',
        '26',
        'CS101',
      );
      const edp = result.split('-').pop()!;
      expect(edp).toHaveLength(5);
      expect(edp).toMatch(/^\d{5}$/);
    });

    it('should uppercase campus', () => {
      const result = service.GenerateShortname(
        'ucmn',
        '1',
        '25',
        '26',
        'CS101',
      );
      expect(result).toMatch(/^UCMN-/);
    });
  });

  describe('BuildCategoryPath', () => {
    it('should build correct category path', () => {
      const result = service.BuildCategoryPath(
        'UCMN',
        '1',
        'CCS',
        'BSCS',
        '25',
        '26',
      );
      expect(result).toBe('UCMN / S12526 / CCS / BSCS');
    });

    it('should uppercase all components', () => {
      const result = service.BuildCategoryPath(
        'ucmn',
        '2',
        'ccs',
        'bscs',
        '25',
        '26',
      );
      expect(result).toBe('UCMN / S22526 / CCS / BSCS');
    });
  });

  describe('GetSemesterDates', () => {
    it('should return semester 1 dates', () => {
      const result = service.GetSemesterDates('1', '2025', '2026');
      expect(result).toEqual({
        startDate: '2025-08-01',
        endDate: '2025-12-18',
      });
    });

    it('should return semester 2 dates', () => {
      const result = service.GetSemesterDates('2', '2025', '2026');
      expect(result).toEqual({
        startDate: '2026-01-20',
        endDate: '2026-06-01',
      });
    });

    it('should return null for invalid semester', () => {
      expect(service.GetSemesterDates('0', '2025', '2026')).toBeNull();
      expect(service.GetSemesterDates('3', '2025', '2026')).toBeNull();
    });
  });

  describe('GenerateStudentUsername', () => {
    it('should produce correct format with zero-padded date', () => {
      const result = service.GenerateStudentUsername('ucmn');
      expect(result).toMatch(/^ucmn-\d{10}$/);
    });

    it('should lowercase campus', () => {
      const result = service.GenerateStudentUsername('UCMN');
      expect(result).toMatch(/^ucmn-/);
    });
  });

  describe('GenerateFacultyUsername', () => {
    it('should produce correct format', () => {
      const result = service.GenerateFacultyUsername('ucmn');
      expect(result).toMatch(/^ucmn-t-\d{5}$/);
    });

    it('should lowercase campus', () => {
      const result = service.GenerateFacultyUsername('UCMN');
      expect(result).toMatch(/^ucmn-t-/);
    });
  });

  describe('GenerateFakeUser', () => {
    it('should generate student with correct username format', () => {
      const user = service.GenerateFakeUser('ucmn', 'student');
      expect(user.username).toMatch(/^ucmn-\d{10}$/);
      expect(user.password).toBe('User123#');
      expect(user.email).toContain('@faculytics.seed');
      expect(user.firstname).toBeTruthy();
      expect(user.lastname).toBeTruthy();
    });

    it('should generate faculty with correct username format', () => {
      const user = service.GenerateFakeUser('ucmn', 'faculty');
      expect(user.username).toMatch(/^ucmn-t-\d{5}$/);
      expect(user.password).toBe('User123#');
    });
  });

  describe('ComputeSchoolYears', () => {
    it('should fix sem 2 only with same-year dates (the reported bug)', () => {
      const result = service.ComputeSchoolYears(2, '2026-01-20', '2026-06-01');
      expect(result).toEqual({ startYY: '25', endYY: '26' });
    });

    it('should fix sem 1 only with same-year dates', () => {
      const result = service.ComputeSchoolYears(1, '2025-08-01', '2025-12-18');
      expect(result).toEqual({ startYY: '25', endYY: '26' });
    });

    it('should handle both semesters (dates span years) for sem 1', () => {
      const result = service.ComputeSchoolYears(1, '2025-08-01', '2026-06-01');
      expect(result).toEqual({ startYY: '25', endYY: '26' });
    });

    it('should handle both semesters (dates span years) for sem 2', () => {
      const result = service.ComputeSchoolYears(2, '2025-08-01', '2026-06-01');
      expect(result).toEqual({ startYY: '25', endYY: '26' });
    });

    it('should handle next school year sem 1 with same-year dates', () => {
      const result = service.ComputeSchoolYears(1, '2026-08-01', '2026-12-18');
      expect(result).toEqual({ startYY: '26', endYY: '27' });
    });

    it('should handle next school year sem 2 with same-year dates', () => {
      const result = service.ComputeSchoolYears(2, '2027-01-20', '2027-06-01');
      expect(result).toEqual({ startYY: '26', endYY: '27' });
    });

    it('should throw for invalid semester number', () => {
      expect(() =>
        service.ComputeSchoolYears(3, '2025-08-01', '2025-12-18'),
      ).toThrow('Invalid semester: 3. Must be 1 or 2.');
    });
  });

  describe('ComputePreview', () => {
    it('should combine all transformations for a valid row', () => {
      const result = service.ComputePreview(
        {
          courseCode: 'CS 101',
          descriptiveTitle: 'Intro to CS',
          program: 'BSCS',
          semester: '1',
        },
        {
          campus: 'UCMN',
          department: 'CCS',
          startDate: '2025-08-01',
          endDate: '2026-06-01',
          startYear: '2025',
          endYear: '2026',
          startYY: '25',
          endYY: '26',
        },
      );

      expect(result.shortname).toMatch(/^UCMN-S12526-CS101-\d{5}$/);
      expect(result.fullname).toBe('Intro to CS');
      expect(result.categoryPath).toBe('UCMN / S12526 / CCS / BSCS');
      expect(result.startDate).toBe('2025-08-01');
      expect(result.endDate).toBe('2025-12-18');
      expect(result.program).toBe('BSCS');
      expect(result.semester).toBe('1');
      expect(result.courseCode).toBe('CS 101');
    });
  });
});
