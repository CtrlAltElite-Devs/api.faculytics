import { ChatKitThread } from './chatkit-thread.entity';
import { ChatKitThreadItem } from './chatkit-thread-item.entity';
import { MoodleToken } from './moodle-token.entity';
import { RefreshToken } from './refresh-token.entity';
import { User } from './user.entity';

export { ChatKitThread, ChatKitThreadItem, MoodleToken, User };
export const entities = [
  User,
  MoodleToken,
  RefreshToken,
  ChatKitThread,
  ChatKitThreadItem,
];
