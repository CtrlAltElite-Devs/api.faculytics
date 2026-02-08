export type MoodleTokenResponse = {
  token: string;
  privatetoken: string;
};

export type MoodleSiteInfoResponse = {
  userid: number;
  username: string;
  firstname: string;
  lastname: string;
  fullname: string;
  lang: string;
  userpictureurl?: string;

  userissiteadmin?: boolean;
  usercanchangeconfig?: boolean;
  usercanviewconfig?: boolean;

  functions?: Array<{
    name: string;
    version: string;
  }>;

  siteurl?: string;
  sitename?: string;
  theme?: string;
};

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  displayname: string;

  enrolledusercount: number;

  category: number;

  startdate: number; // unix timestamp
  enddate: number; // unix timestamp

  visible: 0 | 1;
  hidden: boolean;

  courseimage?: string;

  overviewfiles?: MoodleCourseFile[];

  timemodified: number;
}

export interface MoodleCourseFile {
  filename: string;
  filepath: string;
  filesize: number;
  fileurl: string;
  timemodified: number;
  mimetype: string;
}
