import { IsNumber, IsString } from 'class-validator';

export class GetCourseUserProfilesRequest {
  @IsString()
  token: string;

  @IsNumber()
  userId: number;

  @IsNumber()
  courseId: number;
}
