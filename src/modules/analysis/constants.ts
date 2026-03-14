export const SENTIMENT_GATE = {
  /** Minimum word count for positive comments to pass the topic modeling gate */
  POSITIVE_MIN_WORD_COUNT: 10,
  /** Sentiment labels that always pass the gate */
  ALWAYS_INCLUDE_LABELS: ['negative', 'neutral'] as const,
} as const;

/** Default stage timeout in milliseconds (30 minutes) — reserved for future auto-timeout */
export const PIPELINE_STAGE_TIMEOUT_MS = 1_800_000;

/** Chunk size for bulk TopicAssignment inserts */
export const TOPIC_ASSIGNMENT_BATCH_SIZE = 500;

export const COVERAGE_WARNINGS = {
  /** Minimum response rate before warning */
  MIN_RESPONSE_RATE: 0.25,
  /** Minimum submission count before warning */
  MIN_SUBMISSIONS: 30,
  /** Minimum comment count before warning */
  MIN_COMMENTS: 10,
  /** Minimum post-gate corpus size before warning */
  MIN_POST_GATE_CORPUS: 30,
  /** Hours after which enrollment data is considered stale */
  STALE_SYNC_HOURS: 24,
} as const;
