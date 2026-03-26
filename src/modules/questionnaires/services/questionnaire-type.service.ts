import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  EntityRepository,
  UniqueConstraintViolationException,
} from '@mikro-orm/postgresql';
import { EntityManager } from '@mikro-orm/postgresql';
import { QuestionnaireType } from 'src/entities/questionnaire-type.entity';
import { Questionnaire } from 'src/entities/questionnaire.entity';
import { CacheService } from '../../common/cache/cache.service';
import { CacheNamespace } from '../../common/cache/cache-namespaces';

@Injectable()
export class QuestionnaireTypeService {
  constructor(
    @InjectRepository(QuestionnaireType)
    private readonly typeRepo: EntityRepository<QuestionnaireType>,
    @InjectRepository(Questionnaire)
    private readonly questionnaireRepo: EntityRepository<Questionnaire>,
    private readonly em: EntityManager,
    private readonly cacheService: CacheService,
  ) {}

  async Create(data: {
    name: string;
    code: string;
    description?: string;
  }): Promise<QuestionnaireType> {
    const entity = this.em.create(QuestionnaireType, {
      name: data.name,
      code: data.code,
      description: data.description,
      isSystem: false,
    });

    try {
      this.em.persist(entity);
      await this.em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException(
          `A questionnaire type with code '${data.code}' already exists.`,
        );
      }
      throw error;
    }

    await this.cacheService.invalidateNamespace(
      CacheNamespace.QUESTIONNAIRE_TYPES,
    );

    return entity;
  }

  async FindAll(filters?: {
    isSystem?: boolean;
  }): Promise<QuestionnaireType[]> {
    const where: Record<string, unknown> = {};
    if (filters?.isSystem !== undefined) {
      where.isSystem = filters.isSystem;
    }
    return this.typeRepo.findAll({ where, orderBy: { code: 'ASC' } });
  }

  async FindOne(id: string): Promise<QuestionnaireType> {
    const entity = await this.typeRepo.findOne({ id });
    if (!entity) {
      throw new NotFoundException(
        `Questionnaire type with id '${id}' not found.`,
      );
    }
    return entity;
  }

  async Update(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<QuestionnaireType> {
    const entity = await this.typeRepo.findOne({ id });
    if (!entity) {
      throw new NotFoundException(
        `Questionnaire type with id '${id}' not found.`,
      );
    }

    if (data.name !== undefined) {
      entity.name = data.name;
    }
    if (data.description !== undefined) {
      entity.description = data.description;
    }

    await this.em.flush();
    await this.cacheService.invalidateNamespaces(
      CacheNamespace.QUESTIONNAIRE_TYPES,
      CacheNamespace.QUESTIONNAIRE_VERSIONS,
    );

    return entity;
  }

  async Remove(id: string): Promise<void> {
    const entity = await this.typeRepo.findOne({ id });
    if (!entity) {
      throw new NotFoundException(
        `Questionnaire type with id '${id}' not found.`,
      );
    }

    if (entity.isSystem) {
      throw new ForbiddenException(
        'System questionnaire types cannot be deleted.',
      );
    }

    const questionnaire = await this.questionnaireRepo.findOne({ type: id });
    if (questionnaire) {
      throw new ConflictException(
        'Cannot delete a type that has an associated questionnaire.',
      );
    }

    entity.SoftDelete();
    await this.em.flush();
    await this.cacheService.invalidateNamespace(
      CacheNamespace.QUESTIONNAIRE_TYPES,
    );
  }
}
