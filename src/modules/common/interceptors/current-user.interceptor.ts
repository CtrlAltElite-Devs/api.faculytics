import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { UserLoader } from '../data-loaders/user.loader';
import { CurrentUserService } from '../cls/current-user.service';
import { AuthenticatedRequest } from './http/authenticated-request';

@Injectable()
export class CurrentUserInterceptor implements NestInterceptor {
  constructor(
    private readonly userLoader: UserLoader,
    private readonly currentUserService: CurrentUserService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler<any>) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (req.user?.userId) {
      const user = await this.userLoader.load(req.user.userId);
      this.currentUserService.set(user);
    }

    return next.handle();
  }
}
