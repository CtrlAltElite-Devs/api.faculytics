import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ACCESS_TOKEN } from 'src/configurations/index.config';
import { UserRole } from 'src/modules/auth/roles.enum';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { ROLES_KEY } from './roles.decorator';

export { Roles, ROLES_KEY } from './roles.decorator';

export function UseJwtGuard(...roles: UserRole[]) {
  if (roles.length > 0) {
    return applyDecorators(
      ApiBearerAuth(ACCESS_TOKEN),
      SetMetadata(ROLES_KEY, roles),
      UseGuards(AuthGuard('jwt'), RolesGuard),
    );
  }

  return applyDecorators(
    ApiBearerAuth(ACCESS_TOKEN),
    UseGuards(AuthGuard('jwt')),
  );
}
