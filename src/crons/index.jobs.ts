import { RefreshTokenCleanupJob } from './jobs/auth-jobs/refresh-token-cleanup.job';
import { TieredPipelineSchedulerJob } from './jobs/analysis-jobs/tiered-pipeline-scheduler.job';

export const AllCronJobs = [RefreshTokenCleanupJob, TieredPipelineSchedulerJob];
