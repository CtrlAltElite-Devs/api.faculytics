import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MoodleSiteFunction {
  @IsString()
  name: string;

  @IsString()
  version: string;
}

export class MoodleSiteInfoResponse {
  @IsNumber()
  userid: number;

  @IsString()
  username: string;

  @IsString()
  firstname: string;

  @IsString()
  lastname: string;

  @IsString()
  fullname: string;

  @IsString()
  lang: string;

  @IsOptional()
  @IsString()
  userpictureurl?: string;

  @IsOptional()
  @IsBoolean()
  userissiteadmin?: boolean;

  @IsOptional()
  @IsBoolean()
  usercanchangeconfig?: boolean;

  @IsOptional()
  @IsBoolean()
  usercanviewconfig?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleSiteFunction)
  functions?: MoodleSiteFunction[];

  @IsOptional()
  @IsString()
  siteurl?: string;

  @IsOptional()
  @IsString()
  sitename?: string;

  @IsOptional()
  @IsString()
  theme?: string;
}
