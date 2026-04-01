import { EntityRepository } from '@mikro-orm/postgresql';
import { ReportJob, ReportJobStatus } from '../entities/report-job.entity';

export class ReportJobRepository extends EntityRepository<ReportJob> {
  async FindByJobId(jobId: string): Promise<ReportJob | null> {
    return this.findOne({ id: jobId });
  }

  async FindByBatchId(batchId: string): Promise<ReportJob[]> {
    return this.find({ batchId });
  }

  async FindExpiredCompleted(cutoffDate: Date): Promise<ReportJob[]> {
    return this.find({
      status: 'completed' as ReportJobStatus,
      completedAt: { $lt: cutoffDate },
    });
  }

  async FindByRequestedBy(userId: string): Promise<ReportJob[]> {
    return this.find({ requestedBy: userId });
  }
}
