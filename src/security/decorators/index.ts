import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ACCESS_TOKEN } from 'src/configurations/index.config';

export { Roles, ROLES_KEY } from './roles.decorator';

export function UseJwtGuard() {
  return applyDecorators(
    ApiBearerAuth(ACCESS_TOKEN),
    UseGuards(AuthGuard('jwt')),
  );
}
