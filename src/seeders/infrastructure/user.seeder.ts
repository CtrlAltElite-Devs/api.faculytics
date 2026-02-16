import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { User } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { env } from '../../configurations/env';
import { UserRole } from '../../modules/auth/roles.enum';

export class UserSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const superAdminUsername = env.SUPER_ADMIN_USERNAME;
    const superAdminPassword = env.SUPER_ADMIN_PASSWORD;

    const existingUser = await em.findOne(User, {
      userName: superAdminUsername,
    });

    if (!existingUser) {
      const user = new User();
      user.userName = superAdminUsername;
      user.password = await bcrypt.hash(superAdminPassword, 10);
      user.firstName = 'Super';
      user.lastName = 'Admin';
      user.fullName = 'Super Admin';
      user.userProfilePicture = '';
      user.isActive = true;
      user.lastLoginAt = new Date();
      user.roles = [UserRole.SUPER_ADMIN];

      em.persist(user);
    } else {
      // Update password if it exists to ensure it matches env
      existingUser.password = await bcrypt.hash(superAdminPassword, 10);
      existingUser.roles = [UserRole.SUPER_ADMIN]; // Ensure role is correct
    }
  }
}
