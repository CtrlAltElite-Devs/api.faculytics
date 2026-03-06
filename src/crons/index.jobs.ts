import { CategorySyncJob } from './jobs/category-jobs/category-sync.job';
import { EnrollmentSyncJob } from './jobs/enrollment-jobs/enrollment-sync.job';
import { CourseSyncJob } from './jobs/course-jobs/course-sync.job';
import { RefreshTokenCleanupJob } from './jobs/auth-jobs/refresh-token-cleanup.job';

export const AllCronJobs = [
  CategorySyncJob,
  CourseSyncJob,
  EnrollmentSyncJob,
  RefreshTokenCleanupJob,
];
