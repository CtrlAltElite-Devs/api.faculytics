import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  EntityRepository,
  UniqueConstraintViolationException,
} from '@mikro-orm/postgresql';
import {
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireAnswer,
  QuestionnaireDraft,
  QuestionnaireType,
  User,
  Semester,
  Course,
  Department,
  Program,
  Campus,
  Enrollment,
  TopicAssignment,
  SentimentResult,
  SubmissionEmbedding,
} from '../../../entities/index.entity';
import {
  QuestionnaireStatus,
  QuestionnaireSchemaSnapshot,
  RespondentRole,
  SectionNode,
  QuestionNode,
  EnrollmentRole,
} from '../lib/questionnaire.types';
import { QuestionnaireTypeResponse } from '../dto/responses/questionnaire-type-response.dto';
import { SubmitQuestionnaireResponse } from '../dto/responses/submit-questionnaire-response.dto';
import { QuestionnaireVersionsResponse } from '../dto/responses/questionnaire-version-response.dto';
import { QuestionnaireSchemaValidator } from './questionnaire-schema.validator';
import { ScoringService } from './scoring.service';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserRole } from '../../auth/roles.enum';
import { CacheService } from '../../common/cache/cache.service';
import { CacheNamespace } from '../../common/cache/cache-namespaces';
import { AnalysisService } from '../../analysis/analysis.service';
import { QueueName } from 'src/configurations/common/queue-names';
import { CurrentUserService } from '../../common/cls/current-user.service';
import { env } from 'src/configurations/env';
import { cleanText } from '../utils/clean-text';

@Injectable()
export class QuestionnaireService {
  private readonly logger = new Logger(QuestionnaireService.name);

  constructor(
    @InjectRepository(Questionnaire)
    private readonly questionnaireRepo: EntityRepository<Questionnaire>,
    @InjectRepository(QuestionnaireType)
    private readonly typeRepo: EntityRepository<QuestionnaireType>,
    @InjectRepository(QuestionnaireVersion)
    private readonly versionRepo: EntityRepository<QuestionnaireVersion>,
    @InjectRepository(QuestionnaireSubmission)
    private readonly submissionRepo: EntityRepository<QuestionnaireSubmission>,
    @InjectRepository(QuestionnaireDraft)
    private readonly draftRepo: EntityRepository<QuestionnaireDraft>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepo: EntityRepository<Enrollment>,
    private readonly validator: QuestionnaireSchemaValidator,
    private readonly scoringService: ScoringService,
    private readonly em: EntityManager,
    private readonly cacheService: CacheService,
    private readonly analysisService: AnalysisService,
    private readonly currentUserService: CurrentUserService,
  ) {}

  async getQuestionnaireTypes(): Promise<QuestionnaireTypeResponse[]> {
    return this.cacheService.wrap(
      CacheNamespace.QUESTIONNAIRE_TYPES,
      'all',
      async () => {
        const types = await this.typeRepo.findAll({
          orderBy: { code: 'ASC' },
        });

        const questionnaires = await this.questionnaireRepo.findAll({
          populate: ['type'],
        });

        const questionnaireMap = new Map(
          questionnaires.map((q) => [q.type.id, q]),
        );

        return types.map((type) => {
          const questionnaire = questionnaireMap.get(type.id);
          return {
            id: type.id,
            name: type.name,
            code: type.code,
            description: type.description ?? null,
            isSystem: type.isSystem,
            questionnaireId: questionnaire?.id ?? null,
            questionnaireTitle: questionnaire?.title ?? null,
            questionnaireStatus: questionnaire?.status ?? null,
          };
        });
      },
      3600000,
    );
  }

  async getVersionsByType(
    typeId: string,
  ): Promise<QuestionnaireVersionsResponse> {
    const typeEntity = await this.typeRepo.findOne({ id: typeId });
    if (!typeEntity) {
      throw new NotFoundException(
        `Questionnaire type with id '${typeId}' not found.`,
      );
    }

    return this.cacheService.wrap(
      CacheNamespace.QUESTIONNAIRE_VERSIONS,
      typeId,
      async () => {
        const questionnaire = await this.questionnaireRepo.findOne(
          { type: typeEntity },
          { populate: ['type'] },
        );

        if (!questionnaire) {
          return {
            questionnaireId: null,
            questionnaireTitle: null,
            type: {
              id: typeEntity.id,
              name: typeEntity.name,
              code: typeEntity.code,
            },
            versions: [],
          };
        }

        const versions = await this.versionRepo.find(
          { questionnaire },
          {
            orderBy: { versionNumber: 'DESC' },
            fields: [
              'id',
              'versionNumber',
              'status',
              'isActive',
              'publishedAt',
              'createdAt',
            ],
          },
        );

        return {
          questionnaireId: questionnaire.id,
          questionnaireTitle: questionnaire.title,
          type: {
            id: questionnaire.type.id,
            name: questionnaire.type.name,
            code: questionnaire.type.code,
          },
          versions: versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            status: v.status,
            isActive: v.isActive,
            publishedAt: v.publishedAt,
            createdAt: v.createdAt,
          })),
        };
      },
      3600000,
    );
  }

  async createQuestionnaire(data: { title: string; typeId: string }) {
    const typeEntity = await this.typeRepo.findOne({ id: data.typeId });
    if (!typeEntity) {
      throw new NotFoundException(
        `Questionnaire type with id '${data.typeId}' not found.`,
      );
    }

    const existing = await this.questionnaireRepo.findOne({
      type: typeEntity,
    });
    if (existing) {
      throw new ConflictException(
        'A questionnaire already exists for this type.',
      );
    }

    const questionnaire = this.questionnaireRepo.create({
      title: data.title,
      type: typeEntity,
      status: QuestionnaireStatus.DRAFT,
    });
    this.em.persist(questionnaire);
    await this.em.flush();
    await this.cacheService.invalidateNamespace(
      CacheNamespace.QUESTIONNAIRE_TYPES,
    );
    return questionnaire;
  }

  async UpdateTitle(questionnaireId: string, title: string) {
    const questionnaire = await this.questionnaireRepo.findOne(
      questionnaireId,
      { populate: ['type'] },
    );

    if (!questionnaire) {
      throw new NotFoundException(
        `Questionnaire with ID ${questionnaireId} not found.`,
      );
    }

    questionnaire.title = title;
    await this.em.flush();
    await this.cacheService.invalidateNamespaces(
      CacheNamespace.QUESTIONNAIRE_TYPES,
      CacheNamespace.QUESTIONNAIRE_VERSIONS,
    );

    return questionnaire;
  }

  async CreateVersion(
    questionnaireId: string,
    schema: QuestionnaireSchemaSnapshot,
  ) {
    const questionnaire = await this.questionnaireRepo.findOne(
      questionnaireId,
      { populate: ['type'] },
    );

    if (!questionnaire) {
      throw new NotFoundException(
        `Questionnaire with ID ${questionnaireId} not found.`,
      );
    }

    if (questionnaire.status === QuestionnaireStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot create a version for an archived questionnaire.',
      );
    }

    // Enforce single draft copy rule
    const existingDraft = await this.versionRepo.findOne({
      questionnaire,
      status: QuestionnaireStatus.DRAFT,
    });
    if (existingDraft) {
      throw new ConflictException(
        'A draft version already exists for this questionnaire.',
      );
    }

    // Determine next version number (strict sequential - no skipping)
    const latestVersion = await this.versionRepo.findOne(
      { questionnaire },
      { orderBy: { versionNumber: 'DESC' } },
    );
    const nextVersionNumber = latestVersion
      ? latestVersion.versionNumber + 1
      : 1;

    const version = this.versionRepo.create({
      questionnaire,
      versionNumber: nextVersionNumber,
      schemaSnapshot: schema,
      isActive: false,
      status: QuestionnaireStatus.DRAFT,
    });

    this.em.persist(version);
    await this.em.flush();
    await this.cacheService.invalidateNamespace(
      CacheNamespace.QUESTIONNAIRE_VERSIONS,
    );
    return version;
  }

  async PublishVersion(versionId: string) {
    const version = await this.versionRepo.findOne(versionId, {
      populate: ['questionnaire.type'],
    });

    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${versionId} not found.`,
      );
    }

    if (version.publishedAt) {
      throw new BadRequestException('Version is already published.');
    }

    if (version.questionnaire.status === QuestionnaireStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot publish a version for an archived questionnaire.',
      );
    }

    // Validate schema before publishing
    await this.validator.validate(version.schemaSnapshot);

    // Deactivate and deprecate current active version
    const currentActive = await this.versionRepo.findOne({
      questionnaire: version.questionnaire,
      isActive: true,
    });
    if (currentActive) {
      currentActive.isActive = false;
      currentActive.status = QuestionnaireStatus.DEPRECATED;
    }

    version.isActive = true;
    version.status = QuestionnaireStatus.ACTIVE;
    version.publishedAt = new Date();
    version.questionnaire.status = QuestionnaireStatus.ACTIVE;

    await this.em.flush();
    await this.cacheService.invalidateNamespaces(
      CacheNamespace.QUESTIONNAIRE_TYPES,
      CacheNamespace.QUESTIONNAIRE_VERSIONS,
    );
    return version;
  }

  async DeprecateVersion(versionId: string) {
    const version = await this.versionRepo.findOne(versionId, {
      populate: ['questionnaire.type'],
    });

    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${versionId} not found.`,
      );
    }

    if (version.status === QuestionnaireStatus.DEPRECATED) {
      throw new BadRequestException('Version is already deprecated.');
    }

    if (version.questionnaire.status === QuestionnaireStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot deprecate a version for an archived questionnaire.',
      );
    }

    version.isActive = false;
    version.status = QuestionnaireStatus.DEPRECATED;

    // Check if any other active version exists for this questionnaire
    const otherActiveVersion = await this.versionRepo.findOne({
      questionnaire: version.questionnaire,
      isActive: true,
      id: { $ne: version.id },
    });

    // If no other active version exists, update questionnaire status to DEPRECATED
    if (!otherActiveVersion) {
      version.questionnaire.status = QuestionnaireStatus.DEPRECATED;
    }

    this.em.persist(version);
    await this.em.flush();
    await this.cacheService.invalidateNamespaces(
      CacheNamespace.QUESTIONNAIRE_TYPES,
      CacheNamespace.QUESTIONNAIRE_VERSIONS,
    );
    return version;
  }

  async ArchiveQuestionnaire(questionnaireId: string) {
    const questionnaire = await this.questionnaireRepo.findOne(
      questionnaireId,
      { populate: ['type'] },
    );

    if (!questionnaire) {
      throw new NotFoundException(
        `Questionnaire with ID ${questionnaireId} not found.`,
      );
    }

    if (questionnaire.status === QuestionnaireStatus.ARCHIVED) {
      throw new BadRequestException('Questionnaire is already archived.');
    }

    questionnaire.status = QuestionnaireStatus.ARCHIVED;
    await this.em.flush();
    await this.cacheService.invalidateNamespaces(
      CacheNamespace.QUESTIONNAIRE_TYPES,
      CacheNamespace.QUESTIONNAIRE_VERSIONS,
    );

    return questionnaire;
  }

  async GetVersionById(versionId: string): Promise<QuestionnaireVersion> {
    const version = await this.versionRepo.findOne(versionId, {
      populate: ['questionnaire.type'],
    });

    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${versionId} not found.`,
      );
    }

    return version;
  }

  async UpdateDraftVersion(
    versionId: string,
    data: { schema: QuestionnaireSchemaSnapshot; title?: string },
  ): Promise<QuestionnaireVersion> {
    const version = await this.versionRepo.findOne(versionId, {
      populate: ['questionnaire.type'],
    });

    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${versionId} not found.`,
      );
    }

    if (version.status !== QuestionnaireStatus.DRAFT) {
      throw new BadRequestException('Only draft versions can be updated.');
    }

    version.schemaSnapshot = data.schema;

    if (data.title !== undefined) {
      version.questionnaire.title = data.title;
    }

    await this.em.flush();
    await this.cacheService.invalidateNamespaces(
      CacheNamespace.QUESTIONNAIRE_TYPES,
      CacheNamespace.QUESTIONNAIRE_VERSIONS,
    );

    return version;
  }

  async GetLatestActiveVersion(questionnaireId: string) {
    const questionnaire = await this.questionnaireRepo.findOne(questionnaireId);

    if (!questionnaire) {
      throw new NotFoundException(
        `Questionnaire with ID ${questionnaireId} not found.`,
      );
    }

    const activeVersion = await this.versionRepo.findOne(
      { questionnaire, isActive: true },
      { populate: ['questionnaire.type'] },
    );

    return activeVersion;
  }

  async submitQuestionnaire(
    data: {
      versionId: string;
      respondentId: string;
      facultyId: string;
      semesterId: string;
      courseId?: string;
      answers: Record<string, number>; // questionId -> numericValue
      qualitativeComment?: string;
    },
    options?: { skipAnalysis?: boolean },
  ) {
    const version = await this.versionRepo.findOne(data.versionId, {
      populate: ['questionnaire.type'],
    });

    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${data.versionId} not found.`,
      );
    }

    if (!version.isActive) {
      throw new BadRequestException(
        'Cannot submit to an inactive questionnaire version.',
      );
    }

    if (version.questionnaire.status === QuestionnaireStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot submit to an archived questionnaire.',
      );
    }

    const respondent = await this.em.findOne(User, data.respondentId);
    if (!respondent) {
      throw new NotFoundException(
        `Respondent with ID ${data.respondentId} not found.`,
      );
    }

    const faculty = await this.em.findOne(User, data.facultyId, {
      populate: ['campus', 'department', 'program'],
    });
    if (!faculty) {
      throw new NotFoundException(
        `Faculty with ID ${data.facultyId} not found.`,
      );
    }

    const semester = await this.em.findOne(Semester, data.semesterId, {
      populate: ['campus'],
    });
    if (!semester) {
      throw new NotFoundException(
        `Semester with ID ${data.semesterId} not found.`,
      );
    }

    // 1. Context and Enrollment Validation
    let course: Course | null = null;
    if (data.courseId) {
      course = await this.em.findOne(Course, data.courseId, {
        populate: ['program.department.semester'],
      });
      if (!course) {
        throw new NotFoundException(
          `Course with ID ${data.courseId} not found.`,
        );
      }

      // F1: Safe hierarchy traversal
      const courseSemesterId = course.program?.department?.semester?.id;
      if (courseSemesterId && courseSemesterId !== data.semesterId) {
        throw new BadRequestException(
          `Course ${course.shortname} does not belong to the provided semester context.`,
        );
      }

      // Verify respondent enrollment (unless DEAN or CHAIRPERSON)
      if (
        !respondent.roles.includes(UserRole.DEAN) &&
        !respondent.roles.includes(UserRole.CHAIRPERSON)
      ) {
        const respondentEnrollment = await this.enrollmentRepo.findOne({
          user: respondent,
          course: course,
          role: EnrollmentRole.STUDENT, // F2: Use enum
          isActive: true,
        });
        if (!respondentEnrollment) {
          throw new ForbiddenException(
            'Respondent is not actively enrolled as a student in this course.',
          );
        }
      }

      // Verify faculty enrollment
      const facultyEnrollment = await this.enrollmentRepo.findOne({
        user: faculty,
        course: course,
        role: EnrollmentRole.EDITING_TEACHER, // F2: Use enum
        isActive: true,
      });
      if (!facultyEnrollment) {
        throw new ForbiddenException(
          'Faculty is not actively enrolled as an editing teacher in this course.',
        );
      }
    }

    // 2. Duplicate Check
    const existingSubmission = await this.submissionRepo.findOne({
      respondent,
      faculty,
      questionnaireVersion: version,
      semester,
      course: course || null,
    });
    if (existingSubmission) {
      throw new ConflictException(
        'A submission already exists for this respondent, faculty, and course context.',
      );
    }

    // 3. Answer Validation
    const schema = version.schemaSnapshot;
    const questions = this.GetAllQuestions(schema);
    const maxScore = schema.meta.maxScore > 0 ? schema.meta.maxScore : 5;
    const providedAnswerKeys = new Set(Object.keys(data.answers)); // F9: Optimization

    for (const question of questions) {
      if (!providedAnswerKeys.has(question.id)) {
        throw new BadRequestException(
          `Answer for question ${question.id} is missing.`,
        );
      }
      const value = data.answers[question.id];
      if (question.required && (value === undefined || value === null)) {
        throw new BadRequestException(`Question ${question.id} is required.`);
      }
      if (value !== undefined && value !== null) {
        if (value < 1 || value > maxScore) {
          throw new BadRequestException(
            `Answer for question ${question.id} must be between 1 and ${maxScore}.`,
          );
        }
      }
    }

    // Qualitative comment validation
    if (schema.qualitativeFeedback?.enabled) {
      const comment = data.qualitativeComment;
      // F4: Check requirement
      if (schema.qualitativeFeedback.required && !comment) {
        throw new BadRequestException('Qualitative comment is required.');
      }
      if (comment) {
        const maxLength = schema.qualitativeFeedback.maxLength;
        if (maxLength && comment.length > maxLength) {
          throw new BadRequestException(
            `Qualitative comment exceeds maximum length of ${maxLength}.`,
          );
        }
      }
    }

    // Determine institutional context
    let department: Department | null = null;
    let program: Program | null = null;
    let campus: Campus | null = null;

    if (course) {
      program = course.program ?? faculty.program ?? null;
      department = program?.department ?? faculty.department ?? null;
    } else {
      department = faculty.department || null;
      program = faculty.program || null;
    }

    campus = faculty.campus || semester.campus;

    if (!campus) {
      throw new BadRequestException('Campus context not found for submission.');
    }
    if (!department || !program) {
      throw new BadRequestException(
        'Department or Program context not found for submission.',
      );
    }

    // Scoring
    const scores = this.scoringService.calculateScores(schema, data.answers);

    // Create Submission with Snapshots
    const submission = this.submissionRepo.create({
      questionnaireVersion: version,
      respondent,
      faculty,
      respondentRole: respondent.roles.includes(UserRole.DEAN)
        ? RespondentRole.DEAN
        : respondent.roles.includes(UserRole.CHAIRPERSON)
          ? RespondentRole.CHAIRPERSON
          : RespondentRole.STUDENT,
      semester,
      course: course || undefined,
      department,
      program,
      campus,
      totalScore: scores.totalScore,
      normalizedScore: scores.normalizedScore,
      qualitativeComment: data.qualitativeComment,
      cleanedComment: data.qualitativeComment
        ? (cleanText(data.qualitativeComment) ?? undefined)
        : undefined,
      submittedAt: new Date(),

      // Snapshots
      facultyNameSnapshot:
        faculty.fullName || `${faculty.firstName} ${faculty.lastName}`,
      facultyEmployeeNumberSnapshot: faculty.userName,
      departmentCodeSnapshot: department.code,
      departmentNameSnapshot: department.name || department.code,
      programCodeSnapshot: program.code,
      programNameSnapshot: program.name || program.code,
      campusCodeSnapshot: campus.code,
      campusNameSnapshot: campus.name || campus.code,
      courseCodeSnapshot: course?.shortname || undefined,
      courseTitleSnapshot: course?.fullname || undefined,
      semesterCodeSnapshot: semester.code,
      semesterLabelSnapshot: semester.label || semester.code,
      academicYearSnapshot: semester.academicYear || 'N/A',
    });

    // Create Answers
    for (const [questionId, value] of Object.entries(data.answers)) {
      const meta = this.findQuestionMeta(schema, questionId);

      const answer = this.em.create(QuestionnaireAnswer, {
        submission,
        questionId,
        sectionId: meta.sectionId,
        dimensionCode: meta.dimensionCode,
        numericValue: value,
      });
      submission.answers.add(answer);
    }

    try {
      this.em.persist(submission);
      await this.em.flush();
    } catch (e) {
      // F7: More specific check could be added if constraint name is known
      if (e instanceof UniqueConstraintViolationException) {
        throw new ConflictException(
          'A submission already exists for this context (database constraint violation).',
        );
      }
      throw e;
    }

    await this.cacheService.invalidateNamespace(CacheNamespace.ENROLLMENTS_ME);

    // Fire-and-forget embedding dispatch (uses cleaned text for alignment with topic modeling)
    if (
      !options?.skipAnalysis &&
      submission.cleanedComment &&
      env.EMBEDDINGS_WORKER_URL
    ) {
      try {
        await this.analysisService.EnqueueJob(
          QueueName.EMBEDDING,
          submission.cleanedComment,
          {
            submissionId: submission.id,
            facultyId: data.facultyId,
            versionId: data.versionId,
          },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue embedding for submission ${submission.id}: ${(err as Error).message}`,
        );
      }
    }

    return SubmitQuestionnaireResponse.Map(submission);
  }

  // F6: Iterative traversal to avoid stack overflow
  GetAllQuestions(schema: QuestionnaireSchemaSnapshot): QuestionNode[] {
    const questions: QuestionNode[] = [];
    const stack: SectionNode[] = [...schema.sections];

    while (stack.length > 0) {
      const section = stack.pop()!;
      if (section.questions) {
        questions.push(...section.questions);
      }
      if (section.sections) {
        stack.push(...section.sections);
      }
    }
    return questions;
  }

  private findQuestionMeta(
    schema: QuestionnaireSchemaSnapshot,
    questionId: string,
  ) {
    for (const section of schema.sections) {
      const meta = this.searchInSection(section, questionId);
      if (meta) return meta;
    }
    throw new BadRequestException(
      `Question ID ${questionId} not found in schema.`,
    );
  }

  private searchInSection(
    section: SectionNode,
    questionId: string,
  ): { sectionId: string; dimensionCode: string } | null {
    if (section.questions) {
      const question = section.questions.find((q) => q.id === questionId);
      if (question) {
        return { sectionId: section.id, dimensionCode: question.dimensionCode };
      }
    }
    if (section.sections) {
      for (const subSection of section.sections) {
        const meta = this.searchInSection(subSection, questionId);
        if (meta) return meta;
      }
    }
    return null;
  }

  async SaveOrUpdateDraft(data: {
    versionId: string;
    facultyId: string;
    semesterId: string;
    courseId?: string;
    answers: Record<string, number>;
    qualitativeComment?: string;
  }): Promise<QuestionnaireDraft> {
    const respondentId = this.currentUserService.getOrFail().id;

    // Validate version exists and is active
    const version = await this.versionRepo.findOne(data.versionId);
    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${data.versionId} not found.`,
      );
    }
    if (!version.isActive) {
      throw new BadRequestException(
        'Cannot save draft for an inactive questionnaire version.',
      );
    }

    // Validate respondent exists
    const respondent = await this.em.findOne(User, respondentId);
    if (!respondent) {
      throw new NotFoundException(`User with ID ${respondentId} not found.`);
    }

    // Validate faculty exists
    const faculty = await this.em.findOne(User, data.facultyId);
    if (!faculty) {
      throw new NotFoundException(
        `Faculty with ID ${data.facultyId} not found.`,
      );
    }

    // Validate semester exists
    const semester = await this.em.findOne(Semester, data.semesterId);
    if (!semester) {
      throw new NotFoundException(
        `Semester with ID ${data.semesterId} not found.`,
      );
    }

    // Validate course if provided
    let course: Course | null = null;
    if (data.courseId) {
      course = await this.em.findOne(Course, data.courseId, {
        populate: ['program.department.semester'],
      });
      if (!course) {
        throw new NotFoundException(
          `Course with ID ${data.courseId} not found.`,
        );
      }

      // Validate course belongs to semester
      const courseSemesterId = course.program?.department?.semester?.id;
      if (courseSemesterId && courseSemesterId !== data.semesterId) {
        throw new BadRequestException(
          `Course does not belong to the provided semester context.`,
        );
      }
    }

    // Find existing draft or create a new one
    // Manual find/create pattern used instead of em.upsert because MikroORM's
    // upsert does not support partial unique indexes (WHERE clause conditions).
    let draft = await this.draftRepo.findOne({
      respondent,
      questionnaireVersion: version,
      faculty,
      semester,
      ...(course ? { course } : {}),
    });

    if (draft) {
      draft.answers = data.answers;
      draft.qualitativeComment = data.qualitativeComment;
    } else {
      draft = this.draftRepo.create({
        respondent,
        questionnaireVersion: version,
        faculty,
        semester,
        course,
        answers: data.answers,
        qualitativeComment: data.qualitativeComment,
      });
    }

    await this.em.flush();
    return draft;
  }

  async CheckSubmission(query: {
    versionId: string;
    facultyId: string;
    semesterId: string;
    courseId?: string;
  }): Promise<{ submitted: boolean; submittedAt?: Date; archived?: boolean }> {
    const respondentId = this.currentUserService.getOrFail().id;

    const version = await this.versionRepo.findOne(query.versionId, {
      populate: ['questionnaire'],
    });

    if (version?.questionnaire.status === QuestionnaireStatus.ARCHIVED) {
      return { submitted: false, archived: true };
    }

    const submission = await this.submissionRepo.findOne(
      {
        respondent: respondentId,
        questionnaireVersion: query.versionId,
        faculty: query.facultyId,
        semester: query.semesterId,
        course: query.courseId || null,
      },
      { fields: ['id', 'submittedAt'] },
    );

    if (submission) {
      return { submitted: true, submittedAt: submission.submittedAt };
    }

    return { submitted: false };
  }

  async GetDraft(query: {
    versionId: string;
    facultyId: string;
    semesterId: string;
    courseId?: string;
  }): Promise<QuestionnaireDraft | null> {
    const respondentId = this.currentUserService.getOrFail().id;
    const draft = await this.draftRepo.findOne({
      respondent: respondentId,
      questionnaireVersion: query.versionId,
      faculty: query.facultyId,
      semester: query.semesterId,
      course: query.courseId || null,
    });

    return draft;
  }

  async ListMyDrafts(): Promise<QuestionnaireDraft[]> {
    const respondentId = this.currentUserService.getOrFail().id;
    const drafts = await this.draftRepo.find(
      { respondent: respondentId },
      { orderBy: { updatedAt: 'DESC' } },
    );

    return drafts;
  }

  async DeleteDraft(draftId: string): Promise<void> {
    const respondentId = this.currentUserService.getOrFail().id;
    const draft = await this.draftRepo.findOne({
      id: draftId,
      respondent: respondentId,
    });

    if (!draft) {
      throw new NotFoundException(
        'Draft not found or you do not have permission to delete it.',
      );
    }

    draft.SoftDelete();
    await this.em.flush();
  }

  async WipeSubmissions(versionId: string): Promise<{ deletedCount: number }> {
    const version = await this.versionRepo.findOne(versionId);
    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${versionId} not found.`,
      );
    }

    const submissions = await this.em.find(
      QuestionnaireSubmission,
      { questionnaireVersion: versionId },
      { fields: ['id'], filters: false },
    );

    if (submissions.length === 0) {
      return { deletedCount: 0 };
    }

    const ids = submissions.map((s) => s.id);

    await this.em.nativeDelete(TopicAssignment, {
      submission: { $in: ids },
    });
    await this.em.nativeDelete(SentimentResult, {
      submission: { $in: ids },
    });
    await this.em.nativeDelete(SubmissionEmbedding, {
      submission: { $in: ids },
    });
    await this.em.nativeDelete(QuestionnaireAnswer, {
      submission: { $in: ids },
    });
    await this.em.nativeDelete(QuestionnaireSubmission, {
      id: { $in: ids },
    });

    this.logger.warn(
      `Wiped ${ids.length} submissions and all child records for version ${versionId}`,
    );

    return { deletedCount: ids.length };
  }
}
