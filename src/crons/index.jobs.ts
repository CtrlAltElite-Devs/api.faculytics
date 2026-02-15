import { CategorySyncJob } from './jobs/category-jobs/category-sync.job';
import { EnrollmentSyncJob } from './jobs/enrollment-jobs/enrollment-sync.job';
import { CourseSyncJob } from './jobs/course-jobs/course-sync.job';

export const AllCronJobs = [CategorySyncJob, CourseSyncJob, EnrollmentSyncJob];
