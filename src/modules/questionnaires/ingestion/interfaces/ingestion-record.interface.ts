export interface IngestionRecord<T> {
  data?: T;
  error?: string;
  sourceIdentifier: string | number | Record<string, unknown>;
}
