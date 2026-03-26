export interface SyncPhaseResult {
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  fetched: number;
  inserted: number;
  updated: number;
  deactivated: number;
  errors: number;
  errorMessage?: string;
}

export type SyncTrigger = 'scheduled' | 'manual' | 'startup';

export type SyncStatus = 'running' | 'completed' | 'partial' | 'failed';

export interface MoodleSyncJobData {
  trigger: SyncTrigger;
  triggeredById?: string;
}
