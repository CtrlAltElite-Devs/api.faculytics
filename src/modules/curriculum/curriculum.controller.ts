import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { CurriculumService } from './services/curriculum.service';
import { ListDepartmentsQueryDto } from './dto/requests/list-departments-query.dto';
import { ListProgramsQueryDto } from './dto/requests/list-programs-query.dto';
import { ListCoursesQueryDto } from './dto/requests/list-courses-query.dto';
import { DepartmentListResponseDto } from './dto/responses/department-list.response.dto';
import { ProgramListResponseDto } from './dto/responses/program-list.response.dto';
import { CourseListResponseDto } from './dto/responses/course-list.response.dto';

@ApiTags('Curriculum')
@Controller('curriculum')
@UseJwtGuard(
  UserRole.SUPER_ADMIN,
  UserRole.DEAN,
  UserRole.CHAIRPERSON,
  UserRole.CAMPUS_HEAD,
)
@UseInterceptors(CurrentUserInterceptor)
export class CurriculumController {
  constructor(private readonly curriculumService: CurriculumService) {}

  @Get('departments')
  @ApiOperation({ summary: 'List departments scoped to caller role' })
  @ApiResponse({ status: 200, type: DepartmentListResponseDto })
  async ListDepartments(
    @Query() query: ListDepartmentsQueryDto,
  ): Promise<DepartmentListResponseDto> {
    return this.curriculumService.ListDepartments(query);
  }

  @Get('programs')
  @ApiOperation({ summary: 'List programs scoped to caller role' })
  @ApiResponse({ status: 200, type: ProgramListResponseDto })
  async ListPrograms(
    @Query() query: ListProgramsQueryDto,
  ): Promise<ProgramListResponseDto> {
    return this.curriculumService.ListPrograms(query);
  }

  @Get('courses')
  @ApiOperation({ summary: 'List courses scoped to caller role' })
  @ApiResponse({ status: 200, type: CourseListResponseDto })
  async ListCourses(
    @Query() query: ListCoursesQueryDto,
  ): Promise<CourseListResponseDto> {
    return this.curriculumService.ListCourses(query);
  }
}
