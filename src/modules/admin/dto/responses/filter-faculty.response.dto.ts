import { ApiProperty } from '@nestjs/swagger';
import { User } from 'src/entities/user.entity';

export class FilterFacultyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  fullName: string;

  static Map(user: User): FilterFacultyResponseDto {
    return {
      id: user.id,
      username: user.userName,
      fullName: user.fullName ?? `${user.firstName} ${user.lastName}`,
    };
  }
}
