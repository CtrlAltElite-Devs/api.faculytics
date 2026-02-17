export type SourceConfiguration<TConfig = Record<string, unknown>> = {
  dryRun: boolean;
  maxErrors?: number;
  maxRecords?: number;
} & TConfig;
