import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRepository } from 'src/repositories/user.repository';
import { UserRole } from 'src/modules/auth/roles.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface AuthenticatedUser {
  userId: string;
  moodleUserId: number;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authUser = request.user as AuthenticatedUser | undefined;
    const userId = authUser?.userId;

    if (!userId) {
      throw new ForbiddenException('Access denied');
    }

    const user = await this.userRepository.findOne(
      { id: userId },
      { fields: ['id', 'roles'] },
    );

    if (!user || !user.roles.some((role) => requiredRoles.includes(role))) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
