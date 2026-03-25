import { IsNumber, IsOptional, IsString } from 'class-validator';

export class MoodleCourseGroup {
  @IsNumber()
  id: number;

  @IsNumber()
  courseid: number;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  descriptionformat?: number;

  @IsOptional()
  @IsString()
  enrolmentkey?: string;

  @IsOptional()
  @IsString()
  idnumber?: string;

  @IsOptional()
  @IsNumber()
  visibility?: number;

  @IsOptional()
  @IsNumber()
  participation?: number;
}

export class MoodleCourseUserGroup {
  @IsNumber()
  id: number;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  descriptionformat?: number;

  @IsOptional()
  @IsString()
  idnumber?: string;

  @IsOptional()
  @IsNumber()
  courseid?: number;
}

export class MoodleCourseUserGroupsResponse {
  groups: MoodleCourseUserGroup[];
  warnings?: unknown[];
}
