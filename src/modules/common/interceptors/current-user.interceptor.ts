import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { UserLoader } from '../data-loaders/user.loader';
import { AuthenticatedRequest } from './http/authenticated-request';

@Injectable()
export class CurrentUserInterceptor implements NestInterceptor {
  constructor(private readonly userLoader: UserLoader) {}

  async intercept(context: ExecutionContext, next: CallHandler<any>) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (req.user?.userId) {
      req.currentUser = await this.userLoader.load(req.user?.userId);
    }

    return next.handle();
  }
}
