import {
  Collection,
  Entity,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { MoodleToken } from './moodle-token.entity';
import { Enrollment } from './enrollment.entity';
import { UserRepository } from '../repositories/user.repository';
import { MoodleSiteInfoResponse } from '../modules/moodle/lib/moodle.types';
import { Campus } from './campus.entity';
import { Department } from './department.entity';
import { Program } from './program.entity';
import { UserInstitutionalRole } from './user-institutional-role.entity';

import { UserRole, MoodleRoleMapping } from '../modules/auth/roles.enum';

@Entity({ repository: () => UserRepository })
export class User extends CustomBaseEntity {
  @Property({ unique: true })
  userName: string;

  @Property({ unique: true, nullable: true })
  moodleUserId?: number;

  @Property({ hidden: true, nullable: true })
  password?: string;

  @Property()
  firstName: string;

  @Property()
  lastName: string;

  @Property()
  userProfilePicture: string;

  @Property({ nullable: true })
  fullName?: string;

  @ManyToOne(() => Campus, { nullable: true })
  campus?: Campus;

  /**
   * User's institutional department. Auto-derived from enrollment majority
   * (see EnrollmentSyncService.backfillUserScopes), or manually assigned via
   * admin UI (FAC-127). Manual assignments are protected from sync overwrites
   * via departmentSource = 'manual'.
   */
  @ManyToOne(() => Department, { nullable: true })
  department?: Department;

  /**
   * User's institutional program. Auto-derived from enrollment majority
   * (most enrollments wins; tiebreaker = alphabetically first moodleCategoryId).
   * Manual assignments are protected via programSource = 'manual'.
   */
  @ManyToOne(() => Program, { nullable: true })
  program?: Program;

  // Literal 'auto' (not InstitutionalRoleSource.AUTO): user-institutional-role.entity
  // imports User, so the enum is undefined at this decorator's eval time when the
  // cycle resolves user.entity first.
  @Property({ default: 'auto' })
  departmentSource!: string;

  @Property({ default: 'auto' })
  programSource!: string;

  @OneToMany(() => MoodleToken, (token) => token.user)
  moodleTokens = new Collection<MoodleToken>(this);

  @OneToMany(() => Enrollment, (enrollment) => enrollment.user)
  enrollments = new Collection<Enrollment>(this);

  @OneToMany(() => UserInstitutionalRole, (uir) => uir.user)
  institutionalRoles = new Collection<UserInstitutionalRole>(this);

  @Property()
  lastLoginAt: Date;

  @Property()
  isActive: boolean;

  @Property({ type: 'array', default: [] })
  roles: UserRole[] = [];

  static CreateFromSiteInfoData(siteInfoData: MoodleSiteInfoResponse) {
    const user = new User();
    user.userName = siteInfoData.username;
    user.moodleUserId = siteInfoData.userid;
    user.firstName = siteInfoData.firstname;
    user.lastName = siteInfoData.lastname;
    user.userProfilePicture = siteInfoData.userpictureurl ?? '';
    user.fullName = siteInfoData.fullname;
    user.lastLoginAt = new Date();
    user.isActive = true;
    user.departmentSource = 'auto';
    user.programSource = 'auto';

    return user;
  }

  UpdateFromSiteInfoData(siteInfoData: MoodleSiteInfoResponse) {
    this.userName = siteInfoData.username;
    this.firstName = siteInfoData.firstname;
    this.lastName = siteInfoData.lastname;
    this.fullName = siteInfoData.fullname;
    this.userProfilePicture = siteInfoData.userpictureurl ?? '';
    this.lastLoginAt = new Date();
  }

  updateRolesFromEnrollments(
    enrollments: Enrollment[],
    institutionalRoles: UserInstitutionalRole[] = [],
  ) {
    const protectedRoles = this.roles.filter(
      (r) => r === UserRole.SUPER_ADMIN || r === UserRole.ADMIN,
    );

    const enrollmentRoles = enrollments
      .filter((e) => e.isActive)
      .map(
        (e) =>
          MoodleRoleMapping[e.role] ||
          (e.role.toUpperCase() as unknown as UserRole),
      );

    const instRoles = institutionalRoles.map(
      (ir) =>
        MoodleRoleMapping[ir.role] ||
        (ir.role.toUpperCase() as unknown as UserRole),
    );

    this.roles = [
      ...new Set([...protectedRoles, ...enrollmentRoles, ...instRoles]),
    ].filter(Boolean);
  }
}
