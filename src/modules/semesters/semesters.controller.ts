import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseJwtGuard } from '../../security/decorators';
import { SemestersService } from './semesters.service';
import { SemesterShortResponseDto } from '../enrollments/dto/responses/semester-short.response.dto';

@ApiTags('semesters')
@Controller('semesters')
@UseJwtGuard()
export class SemestersController {
  constructor(private readonly semestersService: SemestersService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get the current (latest active) semester' })
  @ApiResponse({ status: 200, type: SemesterShortResponseDto })
  @ApiResponse({ status: 404, description: 'No active semester found' })
  async getCurrent(): Promise<SemesterShortResponseDto> {
    return this.semestersService.getCurrentSemester();
  }
}
