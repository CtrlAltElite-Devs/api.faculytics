import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MoodleCourseFile {
  @IsString()
  filename: string;

  @IsString()
  filepath: string;

  @IsNumber()
  filesize: number;

  @IsString()
  fileurl: string;

  @IsNumber()
  timemodified: number;

  @IsString()
  mimetype: string;
}

export class MoodleCourse {
  @IsNumber()
  id: number;

  @IsString()
  shortname: string;

  @IsString()
  fullname: string;

  @IsString()
  displayname: string;

  @IsNumber()
  enrolledusercount: number;

  @IsNumber()
  category: number;

  @IsNumber()
  startdate: number;

  @IsNumber()
  enddate: number;

  @IsNumber()
  visible: number;

  @IsBoolean()
  hidden: boolean;

  @IsOptional()
  @IsString()
  courseimage?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleCourseFile)
  overviewfiles?: MoodleCourseFile[];

  @IsNumber()
  timemodified: number;
}
