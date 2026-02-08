import { MoodleToken } from './moodle-token.entity';
import { RefreshToken } from './refresh-token.entity';
import { User } from './user.entity';

export { MoodleToken, User };
export const entities = [User, MoodleToken, RefreshToken];
