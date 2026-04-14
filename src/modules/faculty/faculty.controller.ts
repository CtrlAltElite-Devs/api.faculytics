import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { FacultyService } from './services/faculty.service';
import { ListFacultyQueryDto } from './dto/requests/list-faculty-query.dto';
import { FacultyListResponseDto } from './dto/responses/faculty-list.response.dto';
import { GetSubmissionCountQueryDto } from './dto/requests/get-submission-count-query.dto';
import { SubmissionCountResponseDto } from './dto/responses/submission-count.response.dto';

@ApiTags('Faculty')
@Controller('faculty')
@UseJwtGuard(
  UserRole.SUPER_ADMIN,
  UserRole.DEAN,
  UserRole.CHAIRPERSON,
  UserRole.CAMPUS_HEAD,
)
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

  @Get('cross-department-teaching')
  @ApiOperation({
    summary:
      'List faculty teaching courses outside their home department, scoped to caller',
  })
  @ApiResponse({ status: 200, type: FacultyListResponseDto })
  async findCrossDepartmentTeaching(
    @Query() query: ListFacultyQueryDto,
  ): Promise<FacultyListResponseDto> {
    return this.facultyService.ListCrossDepartmentTeaching(query);
  }

  @Get(':facultyId/submission-count')
  @ApiOperation({
    summary: 'Get submission count for a faculty member in a semester',
  })
  @ApiResponse({ status: 200, type: SubmissionCountResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({
    status: 404,
    description: 'Faculty or semester not found',
  })
  async getSubmissionCount(
    @Param('facultyId', ParseUUIDPipe) facultyId: string,
    @Query() query: GetSubmissionCountQueryDto,
  ): Promise<SubmissionCountResponseDto> {
    return this.facultyService.GetSubmissionCount(facultyId, query.semesterId);
  }
}
