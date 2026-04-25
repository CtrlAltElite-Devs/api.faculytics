import { deriveFacetFromTypeCodeCounts } from '../recommendation-generation.service';

describe('deriveFacetFromTypeCodeCounts (60% dominance rule)', () => {
  it('AC10c: ≥60% dominant primary code → matching facet', () => {
    const counts = new Map<string, number>([
      ['FACULTY_FEEDBACK', 6],
      ['FACULTY_IN_CLASSROOM', 4],
    ]);
    expect(deriveFacetFromTypeCodeCounts(counts)).toBe('facultyFeedback');
  });

  it('AC10c: 59% plurality → overall (not dominant)', () => {
    const counts = new Map<string, number>([
      ['FACULTY_FEEDBACK', 59],
      ['FACULTY_IN_CLASSROOM', 41],
    ]);
    expect(deriveFacetFromTypeCodeCounts(counts)).toBe('overall');
  });

  it('AC10b: even split → overall (tie)', () => {
    const counts = new Map<string, number>([
      ['FACULTY_FEEDBACK', 5],
      ['FACULTY_IN_CLASSROOM', 5],
    ]);
    expect(deriveFacetFromTypeCodeCounts(counts)).toBe('overall');
  });

  it('AC10: non-primary codes dominant → overall', () => {
    const counts = new Map<string, number>([['SOME_OTHER_CODE', 10]]);
    expect(deriveFacetFromTypeCodeCounts(counts)).toBe('overall');
  });

  it('empty input → overall', () => {
    expect(deriveFacetFromTypeCodeCounts(new Map())).toBe('overall');
  });

  it('exact 60% threshold → primary code (inclusive)', () => {
    const counts = new Map<string, number>([
      ['FACULTY_IN_CLASSROOM', 6],
      ['FACULTY_FEEDBACK', 4],
    ]);
    expect(deriveFacetFromTypeCodeCounts(counts)).toBe('inClassroom');
  });

  it('100% of a primary code → matching facet', () => {
    const counts = new Map<string, number>([['FACULTY_OUT_OF_CLASSROOM', 5]]);
    expect(deriveFacetFromTypeCodeCounts(counts)).toBe('outOfClassroom');
  });
});
