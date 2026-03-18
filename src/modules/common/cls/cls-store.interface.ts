import type { ClsStore } from 'nestjs-cls';
import type { User } from 'src/entities/user.entity';
import type { RequestMetadata } from '../interceptors/http/enriched-request';

export interface AppClsStore extends ClsStore {
  currentUser?: User | null;
  jwtPayload?: { userId: string; moodleUserId: number };
  requestMetadata?: RequestMetadata;
}
