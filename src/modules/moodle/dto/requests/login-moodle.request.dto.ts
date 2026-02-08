import { IsString } from 'class-validator';

export class LoginMoodleRequest {
  @IsString()
  username: string;

  @IsString()
  password: string;
}
