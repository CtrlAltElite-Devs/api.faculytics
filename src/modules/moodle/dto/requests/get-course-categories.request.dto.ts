import { IsString } from 'class-validator';

export class GetCourseCategoriesRequest {
  @IsString()
  token: string;
}
