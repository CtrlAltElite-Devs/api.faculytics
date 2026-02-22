import {
  Injectable,
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
  User,
  Semester,
  Course,
  Department,
  Program,
  Campus,
  Enrollment,
} from '../../../entities/index.entity';
import {
  QuestionnaireStatus,
  QuestionnaireSchemaSnapshot,
  RespondentRole,
  SectionNode,
  QuestionnaireType,
  QuestionNode,
  EnrollmentRole,
} from '../lib/questionnaire.types';
import { QuestionnaireSchemaValidator } from './questionnaire-schema.validator';
import { ScoringService } from './scoring.service';
import { EntityManager } from '@mikro-orm/postgresql';
import { UserRole } from '../../auth/roles.enum';

@Injectable()
export class QuestionnaireService {
  constructor(
    @InjectRepository(Questionnaire)
    private readonly questionnaireRepo: EntityRepository<Questionnaire>,
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
  ) {}

  async createQuestionnaire(data: { title: string; type: QuestionnaireType }) {
    const questionnaire = this.questionnaireRepo.create({
      title: data.title,
      type: data.type,
      status: QuestionnaireStatus.DRAFT,
    });
    this.em.persist(questionnaire);
    await this.em.flush();
    return questionnaire;
  }

  async CreateVersion(
    questionnaireId: string,
    schema: QuestionnaireSchemaSnapshot,
  ) {
    const questionnaire = await this.questionnaireRepo.findOne(questionnaireId);

    if (!questionnaire) {
      throw new NotFoundException(
        `Questionnaire with ID ${questionnaireId} not found.`,
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
    return version;
  }

  async PublishVersion(versionId: string) {
    const version = await this.versionRepo.findOne(versionId, {
      populate: ['questionnaire'],
    });

    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${versionId} not found.`,
      );
    }

    if (version.publishedAt) {
      throw new BadRequestException('Version is already published.');
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
    return version;
  }

  async DeprecateVersion(versionId: string) {
    const version = await this.versionRepo.findOne(versionId, {
      populate: ['questionnaire'],
    });

    if (!version) {
      throw new NotFoundException(
        `Questionnaire version with ID ${versionId} not found.`,
      );
    }

    if (version.status === QuestionnaireStatus.DEPRECATED) {
      throw new BadRequestException('Version is already deprecated.');
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
    return version;
  }

  async GetLatestActiveVersion(questionnaireId: string) {
    const questionnaire = await this.questionnaireRepo.findOne(questionnaireId);

    if (!questionnaire) {
      throw new NotFoundException(
        `Questionnaire with ID ${questionnaireId} not found.`,
      );
    }

    const activeVersion = await this.versionRepo.findOne({
      questionnaire,
      isActive: true,
    });

    return activeVersion;
  }

  async submitQuestionnaire(data: {
    versionId: string;
    respondentId: string;
    facultyId: string;
    semesterId: string;
    courseId?: string;
    answers: Record<string, number>; // questionId -> numericValue
    qualitativeComment?: string;
  }) {
    const version = await this.versionRepo.findOne(data.versionId, {
      populate: ['questionnaire'],
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
      if (!courseSemesterId || courseSemesterId !== data.semesterId) {
        throw new BadRequestException(
          `Course ${course.shortname} does not belong to the provided semester context.`,
        );
      }

      // Verify respondent enrollment (unless DEAN)
      if (!respondent.roles.includes(UserRole.DEAN)) {
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
    const questions = this.getAllQuestions(schema);
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
      program = course.program;
      department = program?.department || null; // Safe navigation
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
        : RespondentRole.STUDENT,
      semester,
      course: course || undefined,
      department,
      program,
      campus,
      totalScore: scores.totalScore,
      normalizedScore: scores.normalizedScore,
      qualitativeComment: data.qualitativeComment,
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

    return submission;
  }

  // F6: Iterative traversal to avoid stack overflow
  private getAllQuestions(schema: QuestionnaireSchemaSnapshot): QuestionNode[] {
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

  async SaveOrUpdateDraft(
    respondentId: string,
    data: {
      versionId: string;
      facultyId: string;
      semesterId: string;
      courseId?: string;
      answers: Record<string, number>;
      qualitativeComment?: string;
    },
  ): Promise<QuestionnaireDraft> {
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
      if (!courseSemesterId || courseSemesterId !== data.semesterId) {
        throw new BadRequestException(
          `Course does not belong to the provided semester context.`,
        );
      }
    }

    // Upsert draft using unique constraint
    try {
      const draft = await this.em.upsert(QuestionnaireDraft, {
        respondent,
        questionnaireVersion: version,
        faculty,
        semester,
        course,
        answers: data.answers,
        qualitativeComment: data.qualitativeComment,
      });

      return draft;
    } catch (error) {
      // Handle unique constraint violations gracefully
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException(
          'A draft already exists for this context. Please try again.',
        );
      }
      throw error;
    }
  }

  async GetDraft(
    respondentId: string,
    query: {
      versionId: string;
      facultyId: string;
      semesterId: string;
      courseId?: string;
    },
  ): Promise<QuestionnaireDraft | null> {
    const draft = await this.draftRepo.findOne({
      respondent: respondentId,
      questionnaireVersion: query.versionId,
      faculty: query.facultyId,
      semester: query.semesterId,
      course: query.courseId || null,
    });

    return draft;
  }

  async ListMyDrafts(respondentId: string): Promise<QuestionnaireDraft[]> {
    const drafts = await this.draftRepo.find(
      { respondent: respondentId },
      { orderBy: { updatedAt: 'DESC' } },
    );

    return drafts;
  }

  async DeleteDraft(respondentId: string, draftId: string): Promise<void> {
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
}
