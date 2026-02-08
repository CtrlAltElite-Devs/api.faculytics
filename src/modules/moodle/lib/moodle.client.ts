import { MoodleEndpoint, MoodleWebServiceFunction } from './moodle.constants';
import {
  MoodleTokenResponse,
  MoodleSiteInfoResponse,
  MoodleCourse,
} from './moodle.types';

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

    const tokenRes = (await res.json()) as MoodleTokenResponse;
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

  async getEnrolledCourses(userid: number): Promise<MoodleCourse[]> {
    return await this.call<MoodleCourse[]>(
      MoodleWebServiceFunction.GET_USER_COURSES,
      {
        userid: userid.toString(),
      },
    );
  }
}
