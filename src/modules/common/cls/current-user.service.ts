import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { User } from 'src/entities/user.entity';

@Injectable()
export class CurrentUserService {
  constructor(private readonly cls: ClsService) {}

  get(): User | null {
    return this.cls.get('currentUser') ?? null;
  }

  getOrFail(): User {
    const user = this.get();
    if (!user) throw new UnauthorizedException();
    return user;
  }

  getUserId(): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const userId: string | undefined = this.cls.get('jwtPayload')?.userId;
    return userId;
  }

  set(user: User | null): void {
    this.cls.set('currentUser', user);
  }

  setJwtPayload(payload: { userId: string; moodleUserId: number }): void {
    this.cls.set('jwtPayload', payload);
  }

  /**
   * Executes `fn` with `user` bound as the current CLS user. Used by
   * scheduler / system flows that have no HTTP context but need to call
   * code that reads `currentUserService.get()`. The user object is
   * structurally typed — partial users with only `{id, roles}` are valid
   * for authorization-only paths.
   */
  runAs<T>(user: Pick<User, 'id' | 'roles'>, fn: () => Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.set(user as User);
      return fn();
    });
  }
}
