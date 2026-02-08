import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenRequestBody {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
