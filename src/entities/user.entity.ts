import { Collection, Entity, OneToMany, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { MoodleToken } from './moodle-token.entity';
import { Enrollment } from './enrollment.entity';
import { UserRepository } from '../repositories/user.repository';
import { MoodleSiteInfoResponse } from '../modules/moodle/lib/moodle.types';

@Entity({ repository: () => UserRepository })
export class User extends CustomBaseEntity {
  @Property({ unique: true })
  userName: string;

  @Property({ unique: true })
  moodleUserId: number;

  @Property()
  firstName: string;

  @Property()
  lastName: string;

  @Property()
  userProfilePicture: string;

  @Property({ nullable: true })
  fullName?: string;

  @OneToMany(() => MoodleToken, (token) => token.user)
  moodleTokens = new Collection<MoodleToken>(this);

  @OneToMany(() => Enrollment, (enrollment) => enrollment.user)
  enrollments = new Collection<Enrollment>(this);

  @Property()
  lastLoginAt: Date;

  @Property()
  isActive: boolean;

  @Property({ type: 'array', default: [] })
  roles: string[] = [];

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

  updateRolesFromEnrollments(enrollments: Enrollment[]) {
    this.roles = [
      ...new Set(enrollments.filter((e) => e.isActive).map((e) => e.role)),
    ];
  }
}
