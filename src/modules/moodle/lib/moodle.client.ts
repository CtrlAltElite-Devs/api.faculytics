import { UnauthorizedException } from '@nestjs/common';
import { MoodleEndpoint, MoodleWebServiceFunction } from './moodle.constants';
import {
  MoodleTokenResponse,
  MoodleSiteInfoResponse,
  MoodleCourse,
  MoodleEnrolledUser,
  MoodleCategoryResponse,
} from './moodle.types';
import { MoodleUserProfile } from '../dto/responses/user-profile.response.dto';

export class MoodleClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Ensure no trailing slash
    this.token = token || null;
  }

  setToken(token: string) {
    this.token = token;
  }

  async login(
    username: string,
    password: string,
  ): Promise<MoodleTokenResponse> {
    const res = await fetch(`${this.baseUrl}${MoodleEndpoint.LOGIN_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: username,
        password: password,
        service: MoodleWebServiceFunction.TOKEN_SERVICE,
      }),
    });

    const data = (await res.json()) as MoodleTokenResponse & { error?: string };

    if (res.status === 201 || data.error) {
      throw new UnauthorizedException(
        data.error || 'Invalid login, please try again',
      );
    }

    const tokenRes = data;
    if (tokenRes.token) {
      this.token = tokenRes.token;
    }
    return tokenRes;
  }

  async call<T>(
    functionName: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    if (!this.token) {
      throw new Error(
        'Authentication token is missing. Call login() or setToken() first.',
      );
    }

    const res = await fetch(
      `${this.baseUrl}${MoodleEndpoint.WEBSERVICE_SERVER}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          wstoken: this.token,
          wsfunction: functionName,
          moodlewsrestformat: 'json',
          ...params,
        }),
      },
    );

    return (await res.json()) as T;
  }

  async getSiteInfo(): Promise<MoodleSiteInfoResponse> {
    return await this.call<MoodleSiteInfoResponse>(
      MoodleWebServiceFunction.GET_SITE_INFO,
    );
  }

  async getEnrolledCourses(moodleUserId: number): Promise<MoodleCourse[]> {
    return await this.call<MoodleCourse[]>(
      MoodleWebServiceFunction.GET_USER_COURSES,
      {
        userid: moodleUserId.toString(),
      },
    );
  }

  async getEnrolledUsersByCourse(
    moodleCourseId: number,
  ): Promise<MoodleEnrolledUser[]> {
    return await this.call<MoodleEnrolledUser[]>(
      MoodleWebServiceFunction.GET_ENROLLED_USERS,
      {
        courseid: moodleCourseId.toString(),
      },
    );
  }

  async getEnrolledUsersWithCapability(
    courseId: number,
    capability: string,
  ): Promise<MoodleEnrolledUser[]> {
    return await this.call<MoodleEnrolledUser[]>(
      MoodleWebServiceFunction.GET_ENROLLED_USERS,
      {
        courseid: courseId.toString(),
        'options[0][name]': 'withcapability',
        'options[0][value]': capability,
      },
    );
  }

  async getCourseUserProfiles(
    userList: { userId: number; courseId: number }[],
  ): Promise<MoodleUserProfile[]> {
    const params: Record<string, string> = {};
    userList.forEach((user, index) => {
      params[`userlist[${index}][userid]`] = user.userId.toString();
      params[`userlist[${index}][courseid]`] = user.courseId.toString();
    });

    return await this.call<MoodleUserProfile[]>(
      MoodleWebServiceFunction.GET_COURSE_USER_PROFILES,
      params,
    );
  }

  async getCourses(): Promise<MoodleCourse[]> {
    return await this.call<MoodleCourse[]>(
      MoodleWebServiceFunction.GET_ALL_COURSES,
    );
  }

  async getCategories(): Promise<MoodleCategoryResponse[]> {
    return await this.call<MoodleCategoryResponse[]>(
      MoodleWebServiceFunction.GET_COURSE_CATEGORIES,
    );
  }

  async getCoursesByField(
    field: string,
    value: string,
  ): Promise<{ courses: MoodleCourse[] }> {
    return await this.call<{ courses: MoodleCourse[] }>(
      MoodleWebServiceFunction.GET_COURSES_BY_FIELD,
      {
        field,
        value,
      },
    );
  }
}
