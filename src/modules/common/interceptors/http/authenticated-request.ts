import { Request } from 'express';
import { User } from 'src/entities/user.entity';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    moodleUserId: number;
  };
  currentUser?: User | null;
}
