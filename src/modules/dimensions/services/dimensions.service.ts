import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/postgresql';
import { InjectRepository } from '@mikro-orm/nestjs';
import { DimensionRepository } from 'src/repositories/dimension.repository';
import { Dimension } from 'src/entities/dimension.entity';
import { QuestionnaireType } from 'src/entities/questionnaire-type.entity';
import { QuestionnaireTypeRepository } from 'src/repositories/questionnaire-type.repository';
import { CreateDimensionRequestDto } from '../dto/requests/create-dimension.request.dto';
import { UpdateDimensionRequestDto } from '../dto/requests/update-dimension.request.dto';
import { ListDimensionsQueryDto } from '../dto/requests/list-dimensions-query.dto';
import { DimensionResponseDto } from '../dto/responses/dimension.response.dto';
import { DimensionListResponseDto } from '../dto/responses/dimension-list.response.dto';
import { FilterQuery } from '@mikro-orm/core';

@Injectable()
export class DimensionsService {
  constructor(
    private readonly dimensionRepository: DimensionRepository,
    @InjectRepository(QuestionnaireType)
    private readonly questionnaireTypeRepository: QuestionnaireTypeRepository,
    private readonly em: EntityManager,
  ) {}

  async create(dto: CreateDimensionRequestDto): Promise<DimensionResponseDto> {
    const code = dto.code ?? this.GenerateCode(dto.displayName);

    const typeEntity = await this.questionnaireTypeRepository.findOne({
      id: dto.questionnaireTypeId,
    });
    if (!typeEntity) {
      throw new NotFoundException(
        `Questionnaire type with id '${dto.questionnaireTypeId}' not found.`,
      );
    }

    const dimension = this.em.create(Dimension, {
      code,
      displayName: dto.displayName,
      questionnaireType: typeEntity,
      active: true,
    });

    try {
      await this.em.persist(dimension).flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException(
          `Dimension with code '${code}' already exists for questionnaire type '${typeEntity.code}'.`,
        );
      }
      throw error;
    }

    return DimensionResponseDto.Map(dimension);
  }

  async findAll(
    query: ListDimensionsQueryDto,
  ): Promise<DimensionListResponseDto> {
    const filter: FilterQuery<Dimension> = {};

    if (query.questionnaireTypeId !== undefined) {
      filter.questionnaireType = query.questionnaireTypeId;
    }
    if (query.active !== undefined) {
      filter.active = query.active;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const [dimensions, totalItems] =
      await this.dimensionRepository.findAndCount(filter, {
        limit,
        offset,
        orderBy: { questionnaireType: { code: 'ASC' }, code: 'ASC' },
        populate: ['questionnaireType'],
      });

    return {
      data: dimensions.map((d) => DimensionResponseDto.Map(d)),
      meta: {
        totalItems,
        itemCount: dimensions.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async findOne(id: string): Promise<DimensionResponseDto> {
    const dimension = await this.dimensionRepository.findOne(
      { id },
      { populate: ['questionnaireType'] },
    );

    if (!dimension) {
      throw new NotFoundException(`Dimension with id '${id}' not found.`);
    }

    return DimensionResponseDto.Map(dimension);
  }

  async update(
    id: string,
    dto: UpdateDimensionRequestDto,
  ): Promise<DimensionResponseDto> {
    const dimension = await this.dimensionRepository.findOne(
      { id },
      { populate: ['questionnaireType'] },
    );

    if (!dimension) {
      throw new NotFoundException(`Dimension with id '${id}' not found.`);
    }

    dimension.displayName = dto.displayName;
    await this.em.flush();

    return DimensionResponseDto.Map(dimension);
  }

  async deactivate(id: string): Promise<DimensionResponseDto> {
    const dimension = await this.dimensionRepository.findOne(
      { id },
      { populate: ['questionnaireType'] },
    );

    if (!dimension) {
      throw new NotFoundException(`Dimension with id '${id}' not found.`);
    }

    if (!dimension.active) {
      throw new BadRequestException('Dimension is already inactive.');
    }

    dimension.active = false;
    await this.em.flush();

    return DimensionResponseDto.Map(dimension);
  }

  async activate(id: string): Promise<DimensionResponseDto> {
    const dimension = await this.dimensionRepository.findOne(
      { id },
      { populate: ['questionnaireType'] },
    );

    if (!dimension) {
      throw new NotFoundException(`Dimension with id '${id}' not found.`);
    }

    if (dimension.active) {
      throw new BadRequestException('Dimension is already active.');
    }

    dimension.active = true;
    await this.em.flush();

    return DimensionResponseDto.Map(dimension);
  }

  private GenerateCode(displayName: string): string {
    return displayName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
