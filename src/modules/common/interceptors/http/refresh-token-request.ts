import { Request } from 'express';

export interface RefreshTokenRequest extends Request {
  user?: {
    userId: string;
    refreshTokenId: string;
  };
}
