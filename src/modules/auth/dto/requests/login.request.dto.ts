import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;
}
