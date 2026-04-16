import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { randomUUID } from 'crypto';
import { QuestionnaireVersion } from 'src/entities/questionnaire-version.entity';
import { User } from 'src/entities/user.entity';
import { Course } from 'src/entities/course.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { EnrollmentRole } from 'src/modules/questionnaires/lib/questionnaire.types';
import { QuestionnaireService } from 'src/modules/questionnaires/services/questionnaire.service';
import { CommentGeneratorService } from './comment-generator.service';
import { GetAllQuestionsWithSections } from '../lib/question-flattener';
import { GeneratePreviewRequestDto } from '../dto/requests/generate-preview.request.dto';
import { GeneratePreviewResponseDto } from '../dto/responses/generate-preview.response.dto';
import { GenerateCommitRequestDto } from '../dto/requests/generate-commit.request.dto';
import {
  CommitResultDto,
  CommitRecordResultDto,
} from '../dto/responses/commit-result.response.dto';
import { SubmissionStatusResponseDto } from '../dto/responses/submission-status.response.dto';

@Injectable()
export class AdminGenerateService {
  private readonly logger = new Logger(AdminGenerateService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly commentGenerator: CommentGeneratorService,
    private readonly questionnaireService: QuestionnaireService,
  ) {}

  private async ResolveGenerationContext(dto: GeneratePreviewRequestDto) {
    const version = await this.em.findOne(QuestionnaireVersion, dto.versionId, {
      populate: ['questionnaire.type'],
    });
    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${dto.versionId} not found.`,
      );
    }
    if (!version.isActive) {
      throw new BadRequestException(
        'Cannot generate submissions for an inactive questionnaire version.',
      );
    }

    const faculty = await this.em.findOne(User, {
      userName: dto.facultyUsername,
    });
    if (!faculty) {
      throw new NotFoundException(
        `Faculty with username "${dto.facultyUsername}" not found.`,
      );
    }

    const course = await this.em.findOne(
      Course,
      { shortname: dto.courseShortname },
      { populate: ['program.department.semester'] },
    );
    if (!course) {
      throw new NotFoundException(
        `Course with shortname "${dto.courseShortname}" not found.`,
      );
    }

    const facultyEnrollment = await this.em.findOne(Enrollment, {
      user: faculty,
      course,
      role: EnrollmentRole.EDITING_TEACHER,
      isActive: true,
    });
    if (!facultyEnrollment) {
      throw new BadRequestException(
        `Faculty "${dto.facultyUsername}" is not enrolled as editing teacher in course "${dto.courseShortname}".`,
      );
    }

    const semester = course.program?.department?.semester;
    if (!semester) {
      throw new BadRequestException(
        'Course hierarchy is incomplete — cannot resolve semester from course → program → department → semester.',
      );
    }

    const studentEnrollments = await this.em.find(
      Enrollment,
      { course, role: EnrollmentRole.STUDENT, isActive: true },
      { populate: ['user'] },
    );

    const existingSubmissions = await this.em.find(
      QuestionnaireSubmission,
      { faculty, questionnaireVersion: version, course, semester },
      { populate: ['respondent'] },
    );
    const submittedUserIds = new Set(
      existingSubmissions.map((s) => s.respondent.id),
    );

    const availableStudents = studentEnrollments.filter(
      (e) => !submittedUserIds.has(e.user.id),
    );

    return {
      version,
      faculty,
      course,
      semester,
      studentEnrollments,
      submittedUserIds,
      availableStudents,
    };
  }

  async GetSubmissionStatus(
    dto: GeneratePreviewRequestDto,
  ): Promise<SubmissionStatusResponseDto> {
    const { studentEnrollments, submittedUserIds, availableStudents } =
      await this.ResolveGenerationContext(dto);

    return {
      totalEnrolled: studentEnrollments.length,
      alreadySubmitted: submittedUserIds.size,
      availableStudents: availableStudents.length,
    };
  }

  async GeneratePreview(
    dto: GeneratePreviewRequestDto,
  ): Promise<GeneratePreviewResponseDto> {
    const {
      version,
      faculty,
      course,
      semester,
      studentEnrollments,
      submittedUserIds,
      availableStudents,
    } = await this.ResolveGenerationContext(dto);

    if (availableStudents.length === 0) {
      throw new BadRequestException(
        'All enrolled students have already submitted for this version, faculty, course, and semester combination.',
      );
    }

    const availableCount = availableStudents.length;
    const selectedStudents =
      dto.count != null && dto.count < availableCount
        ? this.SampleStudents(availableStudents, dto.count)
        : availableStudents;

    // 9. Extract questions
    const questions = GetAllQuestionsWithSections(version.schemaSnapshot);

    // 10. Read maxScore
    const maxScore = version.schemaSnapshot.meta.maxScore;

    // 11. Generate answers
    const answersPerStudent = selectedStudents.map(() => {
      const tendency =
        1 + Math.random() * (maxScore - 1) * 0.6 + (maxScore - 1) * 0.3;
      const answers: Record<string, number> = {};
      for (const q of questions) {
        const raw = tendency + (Math.random() - 0.5) * 2;
        answers[q.id] = Math.round(Math.max(1, Math.min(maxScore, raw)));
      }
      return answers;
    });

    // 12. Generate comments (conditional)
    let comments: (string | undefined)[] = selectedStudents.map(
      () => undefined,
    );
    const qf = version.schemaSnapshot.qualitativeFeedback;
    if (qf?.enabled) {
      const generated = await this.commentGenerator.GenerateComments(
        selectedStudents.length,
        {
          courseName: course.fullname,
          facultyName:
            faculty.fullName ?? `${faculty.firstName} ${faculty.lastName}`,
          maxScore,
          maxLength: qf.maxLength,
          promptTheme: dto.promptTheme,
        },
      );
      comments = generated;
    }

    // 13. Build rows
    const now = Date.now();
    const rows = selectedStudents.map((enrollment, index) => ({
      externalId: `gen_${enrollment.user.userName}_${now}_${index}`,
      username: enrollment.user.userName,
      facultyUsername: dto.facultyUsername,
      courseShortname: dto.courseShortname,
      answers: answersPerStudent[index],
      comment: comments[index],
    }));

    // 14. Return response
    return {
      metadata: {
        faculty: {
          username: faculty.userName,
          fullName:
            faculty.fullName ?? `${faculty.firstName} ${faculty.lastName}`,
        },
        course: { shortname: course.shortname, fullname: course.fullname },
        semester: {
          code: semester.code,
          label: semester.label ?? '',
          academicYear: semester.academicYear ?? '',
        },
        version: { id: version.id, versionNumber: version.versionNumber },
        maxScore,
        totalEnrolled: studentEnrollments.length,
        alreadySubmitted: submittedUserIds.size,
        availableStudents: availableCount,
        generatingCount: selectedStudents.length,
      },
      questions: questions.map((q) => ({
        id: q.id,
        text: q.text,
        sectionName: q.sectionName,
      })),
      rows,
    };
  }

  private SampleStudents<T>(pool: T[], count: number): T[] {
    if (count >= pool.length) return pool;
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }

  async CommitSubmissions(
    dto: GenerateCommitRequestDto,
  ): Promise<CommitResultDto> {
    // 1. Load version
    const version = await this.em.findOne(QuestionnaireVersion, dto.versionId, {
      populate: ['questionnaire.type'],
    });
    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${dto.versionId} not found.`,
      );
    }
    if (!version.isActive) {
      throw new BadRequestException(
        'Cannot commit submissions for an inactive questionnaire version.',
      );
    }

    // 2. Load faculty (all rows share the same faculty)
    const faculty = await this.em.findOne(User, {
      userName: dto.rows[0].facultyUsername,
    });
    if (!faculty) {
      throw new NotFoundException(
        `Faculty with username "${dto.rows[0].facultyUsername}" not found.`,
      );
    }
    const facultyId = faculty.id;

    // 3. Load course (all rows share the same course)
    const course = await this.em.findOne(
      Course,
      { shortname: dto.rows[0].courseShortname },
      { populate: ['program.department.semester'] },
    );
    if (!course) {
      throw new NotFoundException(
        `Course with shortname "${dto.rows[0].courseShortname}" not found.`,
      );
    }
    const courseId = course.id;

    // 4. Resolve semester
    const semester = course.program?.department?.semester;
    if (!semester) {
      throw new BadRequestException(
        'Course hierarchy is incomplete — cannot resolve semester.',
      );
    }
    const semesterId = semester.id;

    // 5. Validate answers keys (reject dangerous keys)
    const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
    for (const row of dto.rows) {
      const badKey = Object.keys(row.answers).find((k) => dangerousKeys.has(k));
      if (badKey) {
        throw new BadRequestException(
          `Invalid answer key "${badKey}" in row "${row.externalId}".`,
        );
      }
    }

    // 6. Process rows
    const records: CommitRecordResultDto[] = [];
    let successes = 0;
    let failures = 0;

    for (const row of dto.rows) {
      try {
        // Look up student
        const student = await this.em.findOne(User, { userName: row.username });
        if (!student) {
          records.push({
            externalId: row.externalId,
            success: false,
            error: `Student with username "${row.username}" not found.`,
          });
          failures++;
          continue;
        }

        const result = await this.questionnaireService.submitQuestionnaire(
          {
            versionId: dto.versionId,
            respondentId: student.id,
            facultyId,
            semesterId,
            courseId,
            answers: row.answers,
            qualitativeComment: row.comment,
          },
          { skipAuthorization: true },
        );

        records.push({
          externalId: row.externalId,
          success: true,
          internalId: result.id,
        });
        successes++;
      } catch (error) {
        if (error instanceof HttpException) {
          records.push({
            externalId: row.externalId,
            success: false,
            error: error.message,
          });
        } else {
          records.push({
            externalId: row.externalId,
            success: false,
            error: (error as Error).message,
          });
        }
        failures++;
        this.em.clear();
      }
    }

    return {
      commitId: randomUUID(),
      total: dto.rows.length,
      successes,
      failures,
      dryRun: false,
      records,
    };
  }
}
