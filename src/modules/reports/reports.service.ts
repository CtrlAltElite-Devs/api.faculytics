import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { v4 } from 'uuid';
import { QueueName } from 'src/configurations/common/queue-names';
import { env } from 'src/configurations/index.config';
import { ReportJob, ReportJobStatus } from 'src/entities/report-job.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import {
  StorageProvider,
  STORAGE_PROVIDER,
} from './interfaces/storage-provider.interface';
import { GenerateReportDto } from './dto/generate-report.dto';
import { GenerateBatchReportDto } from './dto/generate-batch-report.dto';
import { ReportStatusResponseDto } from './dto/report-status.response.dto';
import { BatchStatusResponseDto } from './dto/batch-status.response.dto';
import type { ReportJobMessage } from './processors/report-generation.processor';
import { ReportJobRepository } from 'src/repositories/report-job.repository';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';

const REPORT_TYPE = 'faculty_evaluation';

function pgArray(arr: string[]): string {
  return `{${arr.join(',')}}`;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectQueue(QueueName.REPORT_GENERATION)
    private readonly reportQueue: Queue,
    private readonly reportJobRepository: ReportJobRepository,
    private readonly em: EntityManager,
    private readonly scopeResolver: ScopeResolverService,
    private readonly currentUserService: CurrentUserService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async GenerateSingle(
    dto: GenerateReportDto,
    userId: string,
  ): Promise<{ jobId: string }> {
    // Semester validation
    await this.validateSemester(dto.semesterId);

    // Dedup check
    const existing = await this.findPendingJob(
      dto.facultyId,
      dto.semesterId,
      dto.questionnaireTypeCode,
    );
    if (existing) {
      return { jobId: existing.id };
    }

    // Scope validation
    await this.validateFacultyInScope(dto.facultyId, dto.semesterId);

    // Resolve faculty name
    const facultyName = await this.resolveFacultyName(dto.facultyId);

    // Create ReportJob entity
    const fork = this.em.fork();
    const user = fork.getReference(User, userId);
    const reportJob = fork.create(ReportJob, {
      reportType: REPORT_TYPE,
      status: 'waiting' as ReportJobStatus,
      requestedBy: user,
      facultyId: dto.facultyId,
      facultyName,
      semesterId: dto.semesterId,
      questionnaireTypeCode: dto.questionnaireTypeCode,
    });

    try {
      await fork.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        // Race condition — another request created the same job
        const raceExisting = await this.findPendingJob(
          dto.facultyId,
          dto.semesterId,
          dto.questionnaireTypeCode,
        );
        if (raceExisting) {
          return { jobId: raceExisting.id };
        }
      }
      throw error;
    }

    // Enqueue with orphan protection
    try {
      const message: ReportJobMessage = {
        reportJobId: reportJob.id,
        facultyId: dto.facultyId,
        semesterId: dto.semesterId,
        questionnaireTypeCode: dto.questionnaireTypeCode,
      };
      await this.reportQueue.add('report', message, {
        attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (error) {
      // Clean up orphaned entity
      await this.em.nativeDelete(ReportJob, { id: reportJob.id });
      throw error;
    }

    return { jobId: reportJob.id };
  }

  async GenerateBatch(
    dto: GenerateBatchReportDto,
    userId: string,
  ): Promise<{ batchId: string; jobCount: number; skippedCount: number }> {
    // Semester validation
    await this.validateSemester(dto.semesterId);

    // Resolve allowed department IDs
    const deptIds = await this.scopeResolver.ResolveDepartmentIds(
      dto.semesterId,
    );

    // Translate department IDs to codes
    let departmentCodes: string[] | null = null;
    if (deptIds !== null) {
      if (deptIds.length === 0) {
        return { batchId: v4(), jobCount: 0, skippedCount: 0 };
      }
      const codeRows: { code: string }[] = await this.em.execute(
        'SELECT DISTINCT code FROM department WHERE id = ANY(?) AND deleted_at IS NULL',
        [pgArray(deptIds)],
      );
      departmentCodes = codeRows.map((r) => r.code);
    }

    // Apply scope filters
    if (dto.departmentId) {
      const deptCodeRows: { code: string }[] = await this.em.execute(
        'SELECT code FROM department WHERE id = ? AND deleted_at IS NULL',
        [dto.departmentId],
      );
      if (deptCodeRows.length === 0) {
        throw new NotFoundException('Department not found');
      }
      const filterCode = deptCodeRows[0].code;
      if (departmentCodes !== null && !departmentCodes.includes(filterCode)) {
        throw new ForbiddenException('Department is not within your scope');
      }
      departmentCodes = [filterCode];
    }

    let programCode: string | null = null;
    if (dto.programId) {
      const progRows: { code: string }[] = await this.em.execute(
        'SELECT code FROM program WHERE id = ? AND deleted_at IS NULL',
        [dto.programId],
      );
      if (progRows.length === 0) {
        throw new NotFoundException('Program not found');
      }
      programCode = progRows[0].code;
    }

    // Resolve faculty via questionnaire_submission
    const facultyRows: {
      faculty_id: string;
      first_name: string;
      last_name: string;
    }[] = await this.em.execute(
      `SELECT DISTINCT qs.faculty_id, u.first_name, u.last_name
       FROM questionnaire_submission qs
       JOIN "user" u ON u.id = qs.faculty_id
       WHERE qs.semester_id = ?
         AND (?::text[] IS NULL OR qs.department_code_snapshot = ANY(?))
         AND (?::text IS NULL OR qs.program_code_snapshot = ?)
         AND qs.deleted_at IS NULL
         AND u.deleted_at IS NULL`,
      [
        dto.semesterId,
        departmentCodes ? pgArray(departmentCodes) : null,
        departmentCodes ? pgArray(departmentCodes) : null,
        programCode,
        programCode,
      ],
    );

    // Enforce batch size cap
    if (facultyRows.length > env.REPORT_BATCH_MAX_SIZE) {
      throw new BadRequestException(
        `Batch size ${facultyRows.length} exceeds maximum of ${env.REPORT_BATCH_MAX_SIZE}`,
      );
    }

    // Bulk dedup check — single query instead of N
    const allFacultyIds = facultyRows.map((r) => r.faculty_id);
    const pendingJobs = await this.reportJobRepository.find({
      facultyId: { $in: allFacultyIds },
      semesterId: dto.semesterId,
      questionnaireTypeCode: dto.questionnaireTypeCode,
      reportType: REPORT_TYPE,
      status: { $in: ['waiting', 'active'] as ReportJobStatus[] },
    });
    const alreadyQueuedFacultyIds = new Set(
      pendingJobs.map((j) => j.facultyId),
    );

    const facultyToProcess: {
      facultyId: string;
      facultyName: string;
    }[] = [];
    let skippedCount = 0;

    for (const row of facultyRows) {
      if (alreadyQueuedFacultyIds.has(row.faculty_id)) {
        skippedCount++;
      } else {
        facultyToProcess.push({
          facultyId: row.faculty_id,
          facultyName: `${row.first_name} ${row.last_name}`,
        });
      }
    }

    if (facultyToProcess.length === 0) {
      return { batchId: v4(), jobCount: 0, skippedCount };
    }

    // Create batch
    const batchId = v4();
    const fork = this.em.fork();
    const user = fork.getReference(User, userId);

    const reportJobs: ReportJob[] = [];
    for (const faculty of facultyToProcess) {
      const job = fork.create(ReportJob, {
        reportType: REPORT_TYPE,
        status: 'waiting' as ReportJobStatus,
        requestedBy: user,
        facultyId: faculty.facultyId,
        facultyName: faculty.facultyName,
        semesterId: dto.semesterId,
        questionnaireTypeCode: dto.questionnaireTypeCode,
        batchId,
      });
      reportJobs.push(job);
    }

    await fork.flush();

    // Enqueue atomically via addBulk — all succeed or all fail
    const bulkJobs = reportJobs.map((reportJob) => ({
      name: 'report',
      data: {
        reportJobId: reportJob.id,
        facultyId: reportJob.facultyId,
        semesterId: dto.semesterId,
        questionnaireTypeCode: dto.questionnaireTypeCode,
      } as ReportJobMessage,
      opts: {
        attempts: env.BULLMQ_DEFAULT_ATTEMPTS,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }));

    try {
      await this.reportQueue.addBulk(bulkJobs);
    } catch (error) {
      // addBulk is atomic — none were enqueued, clean up all entities
      await this.em.nativeDelete(ReportJob, {
        id: { $in: reportJobs.map((j) => j.id) },
      });
      this.logger.warn(
        `Batch ${batchId}: cleaned up ${reportJobs.length} orphaned jobs after enqueue failure`,
      );
      throw error;
    }

    return {
      batchId,
      jobCount: reportJobs.length,
      skippedCount,
    };
  }

  async GetJobStatus(
    jobId: string,
    userId: string,
  ): Promise<ReportStatusResponseDto> {
    const reportJob = await this.reportJobRepository.findOne(
      { id: jobId },
      { populate: ['requestedBy'] },
    );

    if (!reportJob) {
      throw new NotFoundException('Report job not found');
    }

    // Ownership check
    const currentUser = this.currentUserService.getOrFail();
    if (
      reportJob.requestedBy.id !== userId &&
      !currentUser.roles.includes(UserRole.SUPER_ADMIN)
    ) {
      throw new NotFoundException('Report job not found');
    }

    return this.mapJobToResponse(reportJob);
  }

  async GetBatchStatus(
    batchId: string,
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<BatchStatusResponseDto> {
    page = Math.max(1, Math.floor(page));
    limit = Math.max(1, Math.min(50, Math.floor(limit)));

    // Ownership check via first job (lightweight query)
    const firstJob = await this.reportJobRepository.findOne(
      { batchId },
      { populate: ['requestedBy'] },
    );
    if (!firstJob) {
      throw new NotFoundException('Batch not found');
    }
    const currentUser = this.currentUserService.getOrFail();
    if (
      firstJob.requestedBy.id !== userId &&
      !currentUser.roles.includes(UserRole.SUPER_ADMIN)
    ) {
      throw new NotFoundException('Batch not found');
    }

    // Aggregate counts via SQL
    const countRows: { status: string; count: string }[] =
      await this.em.execute(
        `SELECT status, COUNT(*)::text AS count FROM report_job WHERE batch_id = ? AND deleted_at IS NULL GROUP BY status`,
        [batchId],
      );
    const counts = {
      completed: 0,
      failed: 0,
      skipped: 0,
      active: 0,
      waiting: 0,
    };
    let totalItems = 0;
    for (const row of countRows) {
      if (row.status in counts) {
        counts[row.status as keyof typeof counts] = Number(row.count);
      }
      totalItems += Number(row.count);
    }

    // DB-level pagination for job details
    const totalPages = Math.ceil(totalItems / limit) || 0;
    const offset = (page - 1) * limit;
    const pageJobs = await this.reportJobRepository.find(
      { batchId },
      { orderBy: { createdAt: 'ASC' }, limit, offset },
    );

    // Generate presigned URLs for completed jobs in current page
    const jobs = await Promise.all(
      pageJobs.map((job) => this.mapJobToResponse(job)),
    );

    return {
      batchId,
      total: totalItems,
      completed: counts.completed,
      failed: counts.failed,
      skipped: counts.skipped,
      active: counts.active,
      waiting: counts.waiting,
      jobs,
      meta: {
        totalItems,
        itemCount: jobs.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  private async mapJobToResponse(
    job: ReportJob,
  ): Promise<ReportStatusResponseDto> {
    const response: ReportStatusResponseDto = {
      jobId: job.id,
      status: job.status,
      facultyName: job.facultyName,
      createdAt: job.createdAt.toISOString(),
    };

    if (job.status === 'completed' && job.storageKey) {
      const expirySeconds = env.REPORT_PRESIGNED_URL_EXPIRY_SECONDS;
      response.downloadUrl = await this.storageProvider.GetPresignedUrl(
        job.storageKey,
        expirySeconds,
      );
      response.expiresAt = new Date(
        Date.now() + expirySeconds * 1000,
      ).toISOString();
    }

    if (job.status === 'failed' && job.error) {
      response.error = job.error;
    }

    if (job.status === 'skipped') {
      response.message = 'No evaluation data found';
    }

    if (job.completedAt) {
      response.completedAt = job.completedAt.toISOString();
    }

    return response;
  }

  private async validateSemester(semesterId: string): Promise<void> {
    const rows = await this.em.execute(
      'SELECT id FROM semester WHERE id = ? AND deleted_at IS NULL',
      [semesterId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Semester not found');
    }
  }

  private async findPendingJob(
    facultyId: string,
    semesterId: string,
    questionnaireTypeCode: string,
  ): Promise<ReportJob | null> {
    return this.reportJobRepository.findOne({
      facultyId,
      semesterId,
      questionnaireTypeCode,
      reportType: REPORT_TYPE,
      status: { $in: ['waiting', 'active'] as ReportJobStatus[] },
    });
  }

  private async validateFacultyInScope(
    facultyId: string,
    semesterId: string,
  ): Promise<void> {
    const deptIds = await this.scopeResolver.ResolveDepartmentIds(semesterId);

    if (deptIds === null) {
      return; // super admin — unrestricted
    }

    const userRows: { department_id: string }[] = await this.em.execute(
      'SELECT u.department_id FROM "user" u WHERE u.id = ? AND u.deleted_at IS NULL',
      [facultyId],
    );

    if (userRows.length === 0) {
      throw new NotFoundException('Faculty not found');
    }

    if (!deptIds.includes(userRows[0].department_id)) {
      throw new ForbiddenException(
        'You do not have access to this faculty member',
      );
    }
  }

  private async resolveFacultyName(facultyId: string): Promise<string> {
    const rows: { first_name: string; last_name: string }[] =
      await this.em.execute(
        'SELECT first_name, last_name FROM "user" WHERE id = ? AND deleted_at IS NULL',
        [facultyId],
      );

    if (rows.length === 0) {
      throw new NotFoundException('Faculty not found');
    }

    return `${rows[0].first_name} ${rows[0].last_name}`;
  }
}
