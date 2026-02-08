import { EntityRepository } from '@mikro-orm/postgresql';
import { User } from '../entities/user.entity';
import { MoodleSiteInfoResponse } from '../modules/moodle/lib/moodle.types';

export class UserRepository extends EntityRepository<User> {
  async UpsertFromMoodle(siteInfoData: MoodleSiteInfoResponse) {
    let user = await this.findOne({ moodleUserId: siteInfoData.userid });

    if (user === null) {
      user = this.create(User.CreateFromSiteInfoData(siteInfoData));
    } else {
      user.UpdateFromSiteInfoData(siteInfoData);
    }

    return user;
  }
}
