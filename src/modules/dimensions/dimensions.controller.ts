import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UseJwtGuard, Roles } from 'src/security/decorators';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { DimensionsService } from './services/dimensions.service';
import { CreateDimensionRequestDto } from './dto/requests/create-dimension.request.dto';
import { UpdateDimensionRequestDto } from './dto/requests/update-dimension.request.dto';
import { ListDimensionsQueryDto } from './dto/requests/list-dimensions-query.dto';

@ApiTags('Dimensions')
@Controller('dimensions')
@UseJwtGuard()
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@UseGuards(RolesGuard)
export class DimensionsController {
  constructor(private readonly dimensionsService: DimensionsService) {}

  @Post()
  async create(@Body() dto: CreateDimensionRequestDto) {
    return this.dimensionsService.create(dto);
  }

  @Get()
  async findAll(@Query() query: ListDimensionsQueryDto) {
    return this.dimensionsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.dimensionsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDimensionRequestDto,
  ) {
    return this.dimensionsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.dimensionsService.deactivate(id);
  }

  @Patch(':id/activate')
  async activate(@Param('id') id: string) {
    return this.dimensionsService.activate(id);
  }
}
