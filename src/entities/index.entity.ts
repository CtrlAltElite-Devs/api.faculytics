import { ChatKitThread } from './chatkit-thread.entity';
import { ChatKitThreadItem } from './chatkit-thread-item.entity';
import { MoodleToken } from './moodle-token.entity';
import { RefreshToken } from './refresh-token.entity';
import { User } from './user.entity';
import { Campus } from './campus.entity';
import { Course } from './course.entity';
import { Department } from './department.entity';
import { MoodleCategory } from './moodle-category.entity';
import { Program } from './program.entity';
import { Semester } from './semester.entity';
import { Enrollment } from './enrollment.entity';
import { Dimension } from './dimension.entity';
import { Questionnaire } from './questionnaire.entity';
import { QuestionnaireVersion } from './questionnaire-version.entity';
import { QuestionnaireSubmission } from './questionnaire-submission.entity';
import { QuestionnaireAnswer } from './questionnaire-answer.entity';
import { QuestionnaireDraft } from './questionnaire-draft.entity';
import { UserInstitutionalRole } from './user-institutional-role.entity';
import { SystemConfig } from './system-config.entity';
import { AnalysisPipeline } from './analysis-pipeline.entity';
import { RecommendationRun } from './recommendation-run.entity';
import { RecommendedAction } from './recommended-action.entity';
import { SentimentResult } from './sentiment-result.entity';
import { SentimentRun } from './sentiment-run.entity';
import { SubmissionEmbedding } from './submission-embedding.entity';
import { Topic } from './topic.entity';
import { TopicAssignment } from './topic-assignment.entity';
import { Section } from './section.entity';
import { TopicModelRun } from './topic-model-run.entity';
import { SyncLog } from './sync-log.entity';

export {
  ChatKitThread,
  ChatKitThreadItem,
  MoodleToken,
  User,
  Dimension,
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireAnswer,
  QuestionnaireDraft,
  Campus,
  Course,
  Department,
  MoodleCategory,
  Program,
  Semester,
  Enrollment,
  Section,
  RefreshToken,
  UserInstitutionalRole,
  SystemConfig,
  AnalysisPipeline,
  RecommendationRun,
  RecommendedAction,
  SentimentResult,
  SentimentRun,
  SubmissionEmbedding,
  Topic,
  TopicAssignment,
  TopicModelRun,
  SyncLog,
};

export const entities = [
  User,
  MoodleToken,
  RefreshToken,
  ChatKitThread,
  ChatKitThreadItem,
  Campus,
  Course,
  Department,
  MoodleCategory,
  Program,
  Semester,
  Enrollment,
  Section,
  Dimension,
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireAnswer,
  QuestionnaireDraft,
  UserInstitutionalRole,
  SystemConfig,
  AnalysisPipeline,
  RecommendationRun,
  RecommendedAction,
  SentimentResult,
  SentimentRun,
  SubmissionEmbedding,
  Topic,
  TopicAssignment,
  TopicModelRun,
  SyncLog,
];
