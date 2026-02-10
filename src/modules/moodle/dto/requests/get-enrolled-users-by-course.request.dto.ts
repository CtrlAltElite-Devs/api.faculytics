import { IsNumber, IsString } from 'class-validator';

export class GetEnrolledUsersByCourseRequest {
  @IsString()
  token: string;

  @IsNumber()
  courseId: number;
}
