export { MoodleTokenResponse } from '../dto/responses/token.response.dto';
export {
  MoodleSiteInfoResponse,
  MoodleSiteFunction,
} from '../dto/responses/site-info.response.dto';
export {
  MoodleCourse,
  MoodleCourseFile,
} from '../dto/responses/course.response.dto';
export { MoodleEnrolledUser } from '../dto/responses/enrolled-users-by-course.response.dto';
export { MoodleUserProfile } from '../dto/responses/user-profile.response.dto';
export { MoodleCategoryResponse } from '../dto/responses/moodle-category.response.dto';
export {
  MoodleCourseGroup,
  MoodleCourseUserGroupsResponse,
} from '../dto/responses/course-groups.response.dto';

// Write operation types
export interface MoodleCreateCourseInput {
  shortname: string;
  fullname: string;
  categoryid: number;
  startdate?: number;
  enddate?: number;
  visible?: number;
}

export interface MoodleCreateCourseResult {
  id: number;
  shortname: string;
}

export interface MoodleCreateCategoryInput {
  name: string;
  parent?: number;
  description?: string;
  idnumber?: string;
}

export interface MoodleCreateCategoryResult {
  id: number;
  name: string;
}

export interface MoodleCreateUserInput {
  username: string;
  password: string;
  firstname: string;
  lastname: string;
  email: string;
}

export interface MoodleCreateUserResult {
  id: number;
  username: string;
}

export interface MoodleEnrolmentInput {
  userid: number;
  courseid: number;
  roleid: number;
}

export interface MoodleEnrolResult {
  warnings?: Array<{
    item: string;
    itemid: number;
    warningcode: string;
    message: string;
  }>;
}
