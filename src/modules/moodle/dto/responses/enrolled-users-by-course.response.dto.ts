import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MoodleEnrolledUserCustomField {
  @IsString()
  name: string;

  @IsString()
  shortname: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  value?: string;
}

export class MoodleEnrolledUserPreference {
  @IsString()
  name: string;

  @IsOptional()
  value: string | number;
}

export class MoodleEnrolledUserRole {
  @IsNumber()
  roleid: number;

  @IsString()
  name: string;

  @IsString()
  shortname: string;

  @IsNumber()
  sortorder: number;
}

export class MoodleEnrolledUserCourse {
  @IsNumber()
  id: number;

  @IsString()
  fullname: string;

  @IsString()
  shortname: string;
}

export class MoodleEnrolledUser {
  @IsNumber()
  id: number;

  @IsString()
  username: string;

  @IsString()
  firstname: string;

  @IsString()
  lastname: string;

  @IsString()
  fullname: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone1?: string;

  @IsOptional()
  @IsString()
  phone2?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  idnumber?: string;

  @IsOptional()
  @IsNumber()
  firstaccess?: number;

  @IsOptional()
  @IsNumber()
  lastaccess?: number;

  @IsOptional()
  @IsString()
  auth?: string;

  @IsOptional()
  @IsBoolean()
  suspended?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  mailformat?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  descriptionformat?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  profileimageurlsmall?: string;

  @IsOptional()
  @IsString()
  profileimageurl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleEnrolledUserCustomField)
  customfields?: MoodleEnrolledUserCustomField[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleEnrolledUserPreference)
  preferences?: MoodleEnrolledUserPreference[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleEnrolledUserRole)
  roles?: MoodleEnrolledUserRole[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleEnrolledUserCourse)
  enrolledcourses?: MoodleEnrolledUserCourse[];
}
