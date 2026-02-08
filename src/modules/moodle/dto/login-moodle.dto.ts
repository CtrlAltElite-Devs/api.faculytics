import { IsString } from 'class-validator';

export class LoginMoodleDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}
