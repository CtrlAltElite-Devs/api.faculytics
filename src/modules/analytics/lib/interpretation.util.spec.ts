import { getInterpretation, INTERPRETATION_SCALE } from './interpretation.util';

describe('getInterpretation', () => {
  it('should export 5 tiers', () => {
    expect(INTERPRETATION_SCALE).toHaveLength(5);
  });

  describe('tier mapping', () => {
    it.each([
      [5.0, 'EXCELLENT PERFORMANCE'],
      [4.75, 'EXCELLENT PERFORMANCE'],
      [4.5, 'EXCELLENT PERFORMANCE'],
      [4.49, 'VERY SATISFACTORY PERFORMANCE'],
      [4.0, 'VERY SATISFACTORY PERFORMANCE'],
      [3.5, 'VERY SATISFACTORY PERFORMANCE'],
      [3.49, 'SATISFACTORY PERFORMANCE'],
      [3.0, 'SATISFACTORY PERFORMANCE'],
      [2.5, 'SATISFACTORY PERFORMANCE'],
      [2.49, 'FAIR PERFORMANCE'],
      [2.0, 'FAIR PERFORMANCE'],
      [1.5, 'FAIR PERFORMANCE'],
      [1.49, 'NEEDS IMPROVEMENT'],
      [1.25, 'NEEDS IMPROVEMENT'],
      [1.0, 'NEEDS IMPROVEMENT'],
    ])('should return "%s" → "%s"', (average, expected) => {
      expect(getInterpretation(average)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('should clamp values below 1.00 to NEEDS IMPROVEMENT', () => {
      expect(getInterpretation(0.5)).toBe('NEEDS IMPROVEMENT');
      expect(getInterpretation(0)).toBe('NEEDS IMPROVEMENT');
      expect(getInterpretation(-1)).toBe('NEEDS IMPROVEMENT');
    });

    it('should clamp values above 5.00 to EXCELLENT PERFORMANCE', () => {
      expect(getInterpretation(5.5)).toBe('EXCELLENT PERFORMANCE');
      expect(getInterpretation(10)).toBe('EXCELLENT PERFORMANCE');
    });
  });
});
