import { Type } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';
import { UseJwtGuard, ROLES_KEY } from './index';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { UserRole } from 'src/modules/auth/roles.enum';

describe('UseJwtGuard', () => {
  function applyDecorator(...roles: UserRole[]) {
    @UseJwtGuard(...roles)
    class TestController {}
    return TestController;
  }

  it('should apply only JWT guard when no roles provided', () => {
    const target = applyDecorator();
    const guards = Reflect.getMetadata(GUARDS_METADATA, target) as Type[];

    expect(guards).toHaveLength(1);
    expect(guards[0]).toBe(AuthGuard('jwt'));
  });

  it('should not set roles metadata when no roles provided', () => {
    const target = applyDecorator();
    const roles = Reflect.getMetadata(ROLES_KEY, target) as
      | UserRole[]
      | undefined;

    expect(roles).toBeUndefined();
  });

  it('should apply JWT guard and RolesGuard in correct order when roles provided', () => {
    const target = applyDecorator(UserRole.SUPER_ADMIN, UserRole.ADMIN);
    const guards = Reflect.getMetadata(GUARDS_METADATA, target) as Type[];

    expect(guards).toHaveLength(2);
    expect(guards[0]).toBe(AuthGuard('jwt'));
    expect(guards[1]).toBe(RolesGuard);
  });

  it('should set roles metadata when roles provided', () => {
    const target = applyDecorator(UserRole.SUPER_ADMIN, UserRole.ADMIN);
    const roles = Reflect.getMetadata(ROLES_KEY, target) as UserRole[];

    expect(roles).toEqual([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
  });
});
