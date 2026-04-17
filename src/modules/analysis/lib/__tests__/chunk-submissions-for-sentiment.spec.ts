import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { chunkSubmissionsForSentiment } from '../chunk-submissions-for-sentiment';

const mkSubmissions = (n: number): QuestionnaireSubmission[] =>
  Array.from(
    { length: n },
    (_, i) => ({ id: `s${i}` }) as unknown as QuestionnaireSubmission,
  );

describe('chunkSubmissionsForSentiment', () => {
  it('splits 785 submissions into 16 chunks of at most 50 (tail = 35)', () => {
    const chunks = chunkSubmissionsForSentiment(mkSubmissions(785), 50);
    expect(chunks).toHaveLength(16);
    for (let i = 0; i < 15; i++) {
      expect(chunks[i]).toHaveLength(50);
    }
    expect(chunks[15]).toHaveLength(35);
  });

  it('produces a single chunk when submission count is below chunk size', () => {
    const chunks = chunkSubmissionsForSentiment(mkSubmissions(40), 50);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(40);
  });

  it('produces a single chunk when submission count equals chunk size', () => {
    const chunks = chunkSubmissionsForSentiment(mkSubmissions(50), 50);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(50);
  });

  it('returns an empty array when there are no submissions', () => {
    expect(chunkSubmissionsForSentiment([], 50)).toEqual([]);
  });

  it('partitions every submission into exactly one chunk for arbitrary n', () => {
    for (const n of [1, 7, 49, 50, 51, 99, 100, 501, 1_000]) {
      const subs = mkSubmissions(n);
      const chunks = chunkSubmissionsForSentiment(subs, 50);
      const flattened = chunks.flat();
      expect(flattened).toHaveLength(n);
      expect(new Set(flattened.map((s) => s.id)).size).toBe(n);
    }
  });

  it('rejects non-positive chunk sizes', () => {
    expect(() => chunkSubmissionsForSentiment(mkSubmissions(5), 0)).toThrow();
    expect(() => chunkSubmissionsForSentiment(mkSubmissions(5), -1)).toThrow();
  });
});
