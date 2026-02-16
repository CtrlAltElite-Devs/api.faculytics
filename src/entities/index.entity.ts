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

export { ChatKitThread, ChatKitThreadItem, MoodleToken, User };
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
];
