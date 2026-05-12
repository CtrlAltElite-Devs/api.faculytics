export const QueueName = {
  SENTIMENT: 'sentiment',
  EMBEDDING: 'embedding',
  TOPIC_MODEL: 'topic-model',
  RECOMMENDATIONS: 'recommendations',
  MOODLE_SYNC: 'moodle-sync',
  ANALYTICS_REFRESH: 'analytics-refresh',
  AUDIT: 'audit',
  ERROR_LOG: 'error-log',
  REPORT_GENERATION: 'report-generation',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
