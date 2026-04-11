import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from 'src/modules/auth/roles.enum';
import { Audited } from 'src/modules/audit/decorators/audited.decorator';
import { AuditAction } from 'src/modules/audit/audit-action.enum';
import { AuditInterceptor } from 'src/modules/audit/interceptors/audit.interceptor';
import { MetaDataInterceptor } from 'src/modules/common/interceptors/metadata.interceptor';
import { CurrentUserInterceptor } from 'src/modules/common/interceptors/current-user.interceptor';
import { MoodleProvisioningService } from '../services/moodle-provisioning.service';
import { ProvisionCategoriesRequestDto } from '../dto/requests/provision-categories.request.dto';
import { SeedCoursesContextDto } from '../dto/requests/seed-courses.request.dto';
import { ExecuteCoursesRequestDto } from '../dto/requests/execute-courses.request.dto';
import { QuickCourseRequestDto } from '../dto/requests/quick-course.request.dto';
import { SeedUsersRequestDto } from '../dto/requests/seed-users.request.dto';
import { ProvisionResultDto } from '../dto/responses/provision-result.response.dto';
import { CoursePreviewResultDto } from '../dto/responses/course-preview.response.dto';
import { CoursePreviewRowResponseDto } from '../dto/responses/course-preview.response.dto';
import { SeedUsersResultDto } from '../dto/responses/seed-users-result.response.dto';
import { MoodleConnectivityError } from '../lib/moodle.client';
import { MoodleCategoryTreeResponseDto } from '../dto/responses/moodle-tree.response.dto';
import { MoodleCategoryCoursesResponseDto } from '../dto/responses/moodle-course-preview.response.dto';
import { SeedContext } from '../lib/provisioning.types';

function csvFileFilter(
  _req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!file.originalname.toLowerCase().endsWith('.csv')) {
    callback(
      new BadRequestException(
        'Invalid file type. Only CSV files are accepted.',
      ),
      false,
    );
    return;
  }
  callback(null, true);
}

function buildSeedContext(dto: SeedCoursesContextDto): SeedContext {
  const startYear = dto.startDate.slice(0, 4);
  const endYear = dto.endDate.slice(0, 4);
  return {
    campus: dto.campus,
    department: dto.department,
    startDate: dto.startDate,
    endDate: dto.endDate,
    startYear,
    endYear,
    startYY: startYear.slice(-2),
    endYY: endYear.slice(-2),
  };
}

@ApiTags('Moodle Provisioning')
@Controller('moodle/provision')
export class MoodleProvisioningController {
  private readonly logger = new Logger(MoodleProvisioningController.name);

  constructor(
    private readonly provisioningService: MoodleProvisioningService,
  ) {}

  @Post('categories')
  @HttpCode(HttpStatus.OK)
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @Audited({
    action: AuditAction.MOODLE_PROVISION_CATEGORIES,
    resource: 'MoodleCategory',
  })
  @UseInterceptors(
    MetaDataInterceptor,
    CurrentUserInterceptor,
    AuditInterceptor,
  )
  @ApiOperation({ summary: 'Provision Moodle category tree' })
  @ApiResponse({ status: 200, type: ProvisionResultDto })
  async ProvisionCategories(
    @Body() dto: ProvisionCategoriesRequestDto,
  ): Promise<ProvisionResultDto> {
    return this.handleCategoryOperation(
      () => this.provisioningService.ProvisionCategories(dto),
      'provision',
    );
  }

  @Post('categories/preview')
  @HttpCode(HttpStatus.OK)
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview Moodle category provisioning (dry run)' })
  @ApiResponse({ status: 200, type: ProvisionResultDto })
  async PreviewCategories(
    @Body() dto: ProvisionCategoriesRequestDto,
  ): Promise<ProvisionResultDto> {
    return this.handleCategoryOperation(
      () => this.provisioningService.PreviewCategories(dto),
      'preview',
    );
  }

  @Post('courses/preview')
  @HttpCode(HttpStatus.OK)
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @UseInterceptors(
    MetaDataInterceptor,
    FileInterceptor('file', {
      fileFilter: csvFileFilter,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Preview bulk course seeding from CSV' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'campus', 'department', 'startDate', 'endDate'],
      properties: {
        file: { type: 'string', format: 'binary' },
        campus: { type: 'string' },
        department: { type: 'string' },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
      },
    },
  })
  @ApiResponse({ status: 200, type: CoursePreviewResultDto })
  async PreviewCourses(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SeedCoursesContextDto,
  ): Promise<CoursePreviewResultDto> {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    const context = buildSeedContext(dto);
    return await this.provisioningService.PreviewCourses(file.buffer, context);
  }

  @Post('courses/execute')
  @HttpCode(HttpStatus.OK)
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @Audited({
    action: AuditAction.MOODLE_PROVISION_COURSES,
    resource: 'MoodleCourse',
  })
  @UseInterceptors(
    MetaDataInterceptor,
    CurrentUserInterceptor,
    AuditInterceptor,
  )
  @ApiOperation({ summary: 'Execute bulk course creation in Moodle' })
  @ApiResponse({ status: 200, type: ProvisionResultDto })
  async ExecuteCourses(
    @Body() dto: ExecuteCoursesRequestDto,
  ): Promise<ProvisionResultDto> {
    const context = buildSeedContext({
      campus: dto.campus,
      department: dto.department,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
    return await this.provisioningService.ExecuteCourseSeeding(
      dto.rows,
      context,
    );
  }

  @Post('courses/quick/preview')
  @HttpCode(HttpStatus.OK)
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Preview quick course creation' })
  @ApiResponse({ status: 200, type: CoursePreviewRowResponseDto })
  PreviewQuickCourse(
    @Body() dto: QuickCourseRequestDto,
  ): CoursePreviewRowResponseDto {
    return this.provisioningService.PreviewQuickCourse(dto);
  }

  @Post('courses/quick')
  @HttpCode(HttpStatus.OK)
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @Audited({
    action: AuditAction.MOODLE_PROVISION_QUICK_COURSE,
    resource: 'MoodleCourse',
  })
  @UseInterceptors(
    MetaDataInterceptor,
    CurrentUserInterceptor,
    AuditInterceptor,
  )
  @ApiOperation({ summary: 'Create a single course in Moodle' })
  @ApiResponse({ status: 200, type: ProvisionResultDto })
  async QuickCourse(
    @Body() dto: QuickCourseRequestDto,
  ): Promise<ProvisionResultDto> {
    return await this.provisioningService.ExecuteQuickCourse(dto);
  }

  @Post('users')
  @HttpCode(HttpStatus.OK)
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @Audited({
    action: AuditAction.MOODLE_PROVISION_USERS,
    resource: 'MoodleUser',
  })
  @UseInterceptors(
    MetaDataInterceptor,
    CurrentUserInterceptor,
    AuditInterceptor,
  )
  @ApiOperation({ summary: 'Generate and enrol fake users in Moodle' })
  @ApiResponse({ status: 200, type: SeedUsersResultDto })
  async SeedUsers(
    @Body() dto: SeedUsersRequestDto,
  ): Promise<SeedUsersResultDto> {
    return await this.provisioningService.SeedUsers(dto);
  }

  @Get('tree')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fetch Moodle category tree (live)' })
  @ApiResponse({ status: 200, type: MoodleCategoryTreeResponseDto })
  async GetCategoryTree(): Promise<MoodleCategoryTreeResponseDto> {
    try {
      return await this.provisioningService.GetCategoryTree();
    } catch (e) {
      if (e instanceof MoodleConnectivityError) {
        throw new BadGatewayException('Moodle is unreachable');
      }
      this.logger.error(
        'Failed to fetch category tree',
        e instanceof Error ? e.stack : e,
      );
      throw new ServiceUnavailableException(
        'Failed to fetch Moodle categories',
      );
    }
  }

  @Get('tree/:categoryId/courses')
  @UseJwtGuard(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fetch courses for a Moodle category (live)' })
  @ApiResponse({ status: 200, type: MoodleCategoryCoursesResponseDto })
  @ApiParam({ name: 'categoryId', type: Number })
  async GetCategoryCourses(
    @Param('categoryId', ParseIntPipe) categoryId: number,
  ): Promise<MoodleCategoryCoursesResponseDto> {
    if (categoryId < 1) {
      throw new BadRequestException('Category ID must be a positive integer');
    }
    try {
      return await this.provisioningService.GetCoursesByCategoryWithMasterKey(
        categoryId,
      );
    } catch (e) {
      if (e instanceof MoodleConnectivityError) {
        throw new BadGatewayException('Moodle is unreachable');
      }
      this.logger.error(
        `Failed to fetch courses for category ${categoryId}`,
        e instanceof Error ? e.stack : e,
      );
      throw new ServiceUnavailableException('Failed to fetch Moodle courses');
    }
  }

  private async handleCategoryOperation(
    operation: () => Promise<ProvisionResultDto>,
    label: string,
  ): Promise<ProvisionResultDto> {
    try {
      return await operation();
    } catch (e) {
      if (e instanceof MoodleConnectivityError) {
        throw new BadGatewayException('Moodle is unreachable');
      }
      if (e instanceof Error && e.message.startsWith('Invalid semester')) {
        throw new BadRequestException(e.message);
      }
      this.logger.error(
        `Failed to ${label} categories`,
        e instanceof Error ? e.stack : e,
      );
      throw new ServiceUnavailableException(
        `Failed to ${label} Moodle categories`,
      );
    }
  }
}
