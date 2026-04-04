import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from 'src/modules/auth/roles.enum';
import { CurrentUserInterceptor } from 'src/modules/common/interceptors/current-user.interceptor';
import { AnalyticsService } from './analytics.service';
import {
  DepartmentOverviewQueryDto,
  AttentionListQueryDto,
  FacultyTrendsQueryDto,
  FacultyReportQueryDto,
  FacultyReportCommentsQueryDto,
} from './dto/analytics-query.dto';
import { DepartmentOverviewResponseDto } from './dto/responses/department-overview.response.dto';
import { AttentionListResponseDto } from './dto/responses/attention-list.response.dto';
import { FacultyTrendsResponseDto } from './dto/responses/faculty-trends.response.dto';
import { FacultyReportResponseDto } from './dto/responses/faculty-report.response.dto';
import { FacultyReportCommentsResponseDto } from './dto/responses/faculty-report-comments.response.dto';

@ApiTags('Analytics')
@Controller('analytics')
@UseJwtGuard(UserRole.DEAN, UserRole.CHAIRPERSON, UserRole.SUPER_ADMIN)
@UseInterceptors(CurrentUserInterceptor)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get department overview with faculty stats' })
  @ApiQuery({ name: 'semesterId', required: true, type: String })
  @ApiQuery({ name: 'programCode', required: false, type: String })
  @ApiResponse({ status: 200, type: DepartmentOverviewResponseDto })
  async GetDepartmentOverview(
    @Query() query: DepartmentOverviewQueryDto,
  ): Promise<DepartmentOverviewResponseDto> {
    return this.analyticsService.GetDepartmentOverview(query.semesterId, query);
  }

  @Get('attention')
  @ApiOperation({
    summary: 'Get attention list — faculty flagged for review',
  })
  @ApiQuery({ name: 'semesterId', required: true, type: String })
  @ApiQuery({ name: 'programCode', required: false, type: String })
  @ApiResponse({ status: 200, type: AttentionListResponseDto })
  async GetAttentionList(
    @Query() query: AttentionListQueryDto,
  ): Promise<AttentionListResponseDto> {
    return this.analyticsService.GetAttentionList(query.semesterId, query);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get faculty trend data across semesters' })
  @ApiQuery({ name: 'semesterId', required: false, type: String })
  @ApiQuery({ name: 'minSemesters', required: false, type: Number })
  @ApiQuery({ name: 'minR2', required: false, type: Number })
  @ApiResponse({ status: 200, type: FacultyTrendsResponseDto })
  async GetFacultyTrends(
    @Query() query: FacultyTrendsQueryDto,
  ): Promise<FacultyTrendsResponseDto> {
    return this.analyticsService.GetFacultyTrends(query);
  }

  @Get('faculty/:facultyId/report')
  @ApiOperation({
    summary: 'Get per-question faculty evaluation report',
  })
  @ApiQuery({ name: 'semesterId', required: true, type: String })
  @ApiQuery({ name: 'questionnaireTypeCode', required: true, type: String })
  @ApiQuery({ name: 'courseId', required: false, type: String })
  @ApiResponse({ status: 200, type: FacultyReportResponseDto })
  async GetFacultyReport(
    @Param('facultyId', ParseUUIDPipe) facultyId: string,
    @Query() query: FacultyReportQueryDto,
  ): Promise<FacultyReportResponseDto> {
    return this.analyticsService.GetFacultyReport(facultyId, query);
  }

  @Get('faculty/:facultyId/report/comments')
  @ApiOperation({
    summary: 'Get paginated qualitative comments for faculty report',
  })
  @ApiQuery({ name: 'semesterId', required: true, type: String })
  @ApiQuery({ name: 'questionnaireTypeCode', required: true, type: String })
  @ApiQuery({ name: 'courseId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: FacultyReportCommentsResponseDto })
  async GetFacultyReportComments(
    @Param('facultyId', ParseUUIDPipe) facultyId: string,
    @Query() query: FacultyReportCommentsQueryDto,
  ): Promise<FacultyReportCommentsResponseDto> {
    return this.analyticsService.GetFacultyReportComments(facultyId, query);
  }
}
