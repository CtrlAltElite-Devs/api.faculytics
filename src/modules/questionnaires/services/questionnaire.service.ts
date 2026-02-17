import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
} from '../questionnaire.types';
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

  async createVersion(
    questionnaireId: string,
    schema: QuestionnaireSchemaSnapshot,
  ) {
    const questionnaire =
      await this.questionnaireRepo.findOneOrFail(questionnaireId);

    // Determine next version number
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
    });

    this.em.persist(version);
    await this.em.flush();
    return version;
  }

  async publishVersion(versionId: string) {
    const version = await this.versionRepo.findOneOrFail(versionId, {
      populate: ['questionnaire'],
    });

    if (version.publishedAt) {
      throw new BadRequestException('Version is already published.');
    }

    // Validate schema before publishing
    await this.validator.validate(version.schemaSnapshot);

    // Deactivate current active version
    const currentActive = await this.versionRepo.findOne({
      questionnaire: version.questionnaire,
      isActive: true,
    });
    if (currentActive) {
      currentActive.isActive = false;
    }

    version.isActive = true;
    version.publishedAt = new Date();
    version.questionnaire.status = QuestionnaireStatus.PUBLISHED;

    await this.em.flush();
    return version;
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
    const version = await this.versionRepo.findOneOrFail(data.versionId, {
      populate: ['questionnaire'],
    });

    if (!version.isActive) {
      throw new BadRequestException(
        'Cannot submit to an inactive questionnaire version.',
      );
    }

    const respondent = await this.em.findOneOrFail(User, data.respondentId);
    const faculty = await this.em.findOneOrFail(User, data.facultyId, {
      populate: ['campus', 'department', 'program'],
    });
    const semester = await this.em.findOneOrFail(Semester, data.semesterId, {
      populate: ['campus'],
    });

    // 1. Context and Enrollment Validation
    let course: Course | null = null;
    if (data.courseId) {
      course = await this.em.findOneOrFail(Course, data.courseId, {
        populate: ['program.department.semester'],
      });

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
}
