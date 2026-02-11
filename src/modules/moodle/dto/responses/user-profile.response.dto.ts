import { IsNumber, IsOptional } from 'class-validator';
import { MoodleEnrolledUser } from './enrolled-users-by-course.response.dto';

export class MoodleUserProfile extends MoodleEnrolledUser {
  @IsOptional()
  @IsNumber()
  trackforums?: number;
}
