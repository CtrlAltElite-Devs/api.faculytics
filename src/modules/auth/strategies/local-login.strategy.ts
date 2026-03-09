import { Injectable, UnauthorizedException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import * as bcrypt from 'bcrypt';
import { LoginRequest } from '../dto/requests/login.request.dto';
import { User } from 'src/entities/user.entity';
import { LoginStrategy, LoginStrategyResult } from './login-strategy.interface';

@Injectable()
export class LocalLoginStrategy implements LoginStrategy {
  readonly priority = 10;

  CanHandle(localUser: User | null, _body: LoginRequest): boolean {
    return localUser !== null && localUser.password !== null;
  }

  async Execute(
    _em: EntityManager,
    localUser: User | null,
    body: LoginRequest,
  ): Promise<LoginStrategyResult> {
    if (!localUser || !localUser.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      body.password,
      localUser.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { user: localUser };
  }
}
