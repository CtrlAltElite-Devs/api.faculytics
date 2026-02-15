import { IsNumber, IsString, IsOptional } from 'class-validator';

export class MoodleCategoryResponse {
  @IsNumber()
  id: number;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  idnumber?: string;

  @IsString()
  description: string;

  @IsNumber()
  descriptionformat: number;

  @IsNumber()
  parent: number;

  @IsNumber()
  sortorder: number;

  @IsNumber()
  coursecount: number;

  @IsNumber()
  visible: number;

  @IsNumber()
  visibleold: number;

  @IsNumber()
  timemodified: number;

  @IsNumber()
  depth: number;

  @IsString()
  path: string;

  @IsOptional()
  @IsString()
  theme?: string;
}
