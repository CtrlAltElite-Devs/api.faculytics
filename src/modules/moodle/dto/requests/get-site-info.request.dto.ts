import { IsString } from 'class-validator';

export class GetSiteInfoRequest {
  @IsString()
  token: string;
}
