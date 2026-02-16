import { EntityRepository } from '@mikro-orm/postgresql';
import { User } from '../entities/user.entity';
import { MoodleSiteInfoResponse } from '../modules/moodle/lib/moodle.types';
import { Campus } from '../entities/campus.entity';

export class UserRepository extends EntityRepository<User> {
  async UpsertFromMoodle(siteInfoData: MoodleSiteInfoResponse) {
    let user = await this.findOne({ moodleUserId: siteInfoData.userid });

    if (user === null) {
      user = this.create(User.CreateFromSiteInfoData(siteInfoData));
    } else {
      user.UpdateFromSiteInfoData(siteInfoData);
    }

    const campusCode = siteInfoData.username.split('-')[0].toUpperCase();
    const campus = await this.getEntityManager().findOne(Campus, {
      code: campusCode,
    });
    user.campus = campus ?? undefined;

    return user;
  }
}
