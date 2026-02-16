import { EntityManager } from '@mikro-orm/core';
import { InfrastructureSeeder } from '../infrastructure/infrastructure.seeder';
import { DimensionSeeder } from '../infrastructure/dimension.seeder';
import { UserSeeder } from '../infrastructure/user.seeder';
import { SystemConfigSeeder } from '../infrastructure/system-config.seeder';
import { User } from '../../entities/user.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { UserRole } from '../../modules/auth/roles.enum';

describe('DatabaseSeeders', () => {
  let em: jest.Mocked<EntityManager>;

  beforeEach(() => {
    em = {
      findOne: jest.fn(),
      persist: jest.fn(),
      flush: jest.fn(),
      getRepository: jest.fn(),
      create: jest.fn(),
      assign: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;
  });

  describe('UserSeeder', () => {
    it('should create super admin if it does not exist', async () => {
      const seeder = new UserSeeder();
      em.findOne.mockResolvedValue(null);

      await seeder.run(em);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(em.persist).toHaveBeenCalledWith(expect.any(User));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const persistMock = em.persist as jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const persistedUser = persistMock.mock.calls[0][0] as User;
      expect(persistedUser.roles).toContain(UserRole.SUPER_ADMIN);
    });

    it('should update super admin roles if it already exists', async () => {
      const seeder = new UserSeeder();
      const existingUser = new User();
      existingUser.userName = 'admin';
      existingUser.roles = [];
      em.findOne.mockResolvedValue(existingUser);

      await seeder.run(em);

      expect(existingUser.roles).toContain(UserRole.SUPER_ADMIN);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(em.persist).not.toHaveBeenCalled();
    });
  });

  describe('SystemConfigSeeder', () => {
    it('should seed default configurations if they do not exist', async () => {
      const seeder = new SystemConfigSeeder();
      em.findOne.mockResolvedValue(null);

      await seeder.run(em);

      // APP_NAME, MAINTENANCE_MODE, MOODLE_SYNC_INTERVAL_MINUTES
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(em.persist).toHaveBeenCalledTimes(3);
    });

    it('should not seed duplicates for existing configurations', async () => {
      const seeder = new SystemConfigSeeder();
      em.findOne.mockResolvedValue(new SystemConfig());

      await seeder.run(em);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(em.persist).not.toHaveBeenCalled();
    });
  });

  describe('InfrastructureSeeder (Integration)', () => {
    it('should call sub-seeders', async () => {
      const infraSeeder = new InfrastructureSeeder();
      const callSpy = jest
        .spyOn(infraSeeder as any, 'call')
        .mockResolvedValue(undefined);

      await infraSeeder.run(em);

      expect(callSpy).toHaveBeenCalledWith(em, [
        DimensionSeeder,
        UserSeeder,
        SystemConfigSeeder,
      ]);
    });
  });
});
