import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseJwtGuard } from '../../security/decorators';
import { SemestersService } from './semesters.service';
import { SemesterListResponseDto } from './dto/responses/semester-list.response.dto';

@ApiTags('semesters')
@Controller('semesters')
@UseJwtGuard()
export class SemestersController {
  constructor(private readonly semestersService: SemestersService) {}

  @Get()
  @ApiOperation({ summary: 'List all semesters with campus info' })
  @ApiResponse({ status: 200, type: SemesterListResponseDto })
  async list(): Promise<SemesterListResponseDto> {
    return this.semestersService.listSemesters();
  }
}
