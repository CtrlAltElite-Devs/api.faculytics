import { IsNumber, IsString } from 'class-validator';

export class GetEnrolledCoursesRequest {
  @IsString()
  token: string;

  @IsNumber()
  userId: number;
}
