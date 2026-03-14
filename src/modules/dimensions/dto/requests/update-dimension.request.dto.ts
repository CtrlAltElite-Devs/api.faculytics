import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateDimensionRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;
}
