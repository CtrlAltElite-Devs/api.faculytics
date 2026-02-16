import { IsString } from 'class-validator';

export class GetMoodleCoursesRequest {
  @IsString()
  token: string;
}
