import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { FacultyService } from './services/faculty.service';
import { ListFacultyQueryDto } from './dto/requests/list-faculty-query.dto';
import { FacultyListResponseDto } from './dto/responses/faculty-list.response.dto';

@ApiTags('Faculty')
@Controller('faculty')
@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN)
@UseInterceptors(CurrentUserInterceptor)
export class FacultyController {
  constructor(private readonly facultyService: FacultyService) {}

  @Get()
  @ApiOperation({ summary: 'List faculty members scoped to caller role' })
  @ApiResponse({ status: 200, type: FacultyListResponseDto })
  async findAll(
    @Query() query: ListFacultyQueryDto,
  ): Promise<FacultyListResponseDto> {
    return this.facultyService.ListFaculty(query);
  }
}
