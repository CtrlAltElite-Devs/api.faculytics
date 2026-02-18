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
  RefreshToken,
  UserInstitutionalRole,
  SystemConfig,
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
  Dimension,
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireAnswer,
  QuestionnaireDraft,
  UserInstitutionalRole,
  SystemConfig,
];
