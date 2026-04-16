import type { ScopeType } from 'src/modules/analysis/dto/facet.dto';

// Extracted from tiered-pipeline-scheduler.job.ts to break a circular
// import: pipeline-orchestrator.service → next-scheduled-run → (here)
// instead of (here → job → orchestrator).

export const TIERED_SCHEDULER_CRON_NAMES = {
  FACULTY: 'TieredPipelineSchedulerJob.RunFacultyTier',
  DEPARTMENT: 'TieredPipelineSchedulerJob.RunDepartmentTier',
  CAMPUS: 'TieredPipelineSchedulerJob.RunCampusTier',
} as const;

export const TIERED_SCHEDULER_CRON_EXPRS: Record<ScopeType, string> = {
  FACULTY: '0 1 * * 0', // Sunday 01:00 UTC
  DEPARTMENT: '0 2 * * 0', // Sunday 02:00 UTC
  CAMPUS: '0 3 * * 0', // Sunday 03:00 UTC
};
