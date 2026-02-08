import { IsString } from 'class-validator';

export class MoodleTokenResponse {
  @IsString()
  token: string;

  @IsString()
  privatetoken: string;
}
