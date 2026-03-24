import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { CurriculumService } from './services/curriculum.service';
import { ListDepartmentsQueryDto } from './dto/requests/list-departments-query.dto';
import { ListProgramsQueryDto } from './dto/requests/list-programs-query.dto';
import { ListCoursesQueryDto } from './dto/requests/list-courses-query.dto';
import { DepartmentItemResponseDto } from './dto/responses/department-item.response.dto';
import { ProgramItemResponseDto } from './dto/responses/program-item.response.dto';
import { CourseItemResponseDto } from './dto/responses/course-item.response.dto';

@ApiTags('Curriculum')
@Controller('curriculum')
@UseJwtGuard(UserRole.SUPER_ADMIN, UserRole.DEAN, UserRole.CHAIRPERSON)
@UseInterceptors(CurrentUserInterceptor)
export class CurriculumController {
  constructor(private readonly curriculumService: CurriculumService) {}

  @Get('departments')
  @ApiOperation({ summary: 'List departments scoped to caller role' })
  @ApiResponse({ status: 200, type: [DepartmentItemResponseDto] })
  async ListDepartments(
    @Query() query: ListDepartmentsQueryDto,
  ): Promise<DepartmentItemResponseDto[]> {
    return this.curriculumService.ListDepartments(query);
  }

  @Get('programs')
  @ApiOperation({ summary: 'List programs scoped to caller role' })
  @ApiResponse({ status: 200, type: [ProgramItemResponseDto] })
  async ListPrograms(
    @Query() query: ListProgramsQueryDto,
  ): Promise<ProgramItemResponseDto[]> {
    return this.curriculumService.ListPrograms(query);
  }

  @Get('courses')
  @ApiOperation({ summary: 'List courses scoped to caller role' })
  @ApiResponse({ status: 200, type: [CourseItemResponseDto] })
  async ListCourses(
    @Query() query: ListCoursesQueryDto,
  ): Promise<CourseItemResponseDto[]> {
    return this.curriculumService.ListCourses(query);
  }
}
