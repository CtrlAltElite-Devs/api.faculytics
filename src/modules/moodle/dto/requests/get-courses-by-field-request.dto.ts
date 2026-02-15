import { IsString } from 'class-validator';

export class GetCoursesByFieldRequest {
  @IsString()
  token: string;

  @IsString()
  field: string;

  @IsString()
  value: string;
}
