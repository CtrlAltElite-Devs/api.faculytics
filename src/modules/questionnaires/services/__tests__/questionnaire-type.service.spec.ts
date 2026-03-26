/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { UniqueConstraintViolationException } from '@mikro-orm/postgresql';
import { EntityManager } from '@mikro-orm/postgresql';
import { QuestionnaireTypeService } from '../questionnaire-type.service';
import { QuestionnaireType } from 'src/entities/questionnaire-type.entity';
import { Questionnaire } from 'src/entities/questionnaire.entity';
import { CacheService } from 'src/modules/common/cache/cache.service';

describe('QuestionnaireTypeService', () => {
  let service: QuestionnaireTypeService;
  let typeRepo: any;
  let questionnaireRepo: any;
  let em: any;
  let cacheService: any;

  beforeEach(async () => {
    typeRepo = {
      findOne: jest.fn(),
      findAll: jest.fn(),
    };
    questionnaireRepo = {
      findOne: jest.fn(),
    };
    em = {
      create: jest
        .fn()
        .mockImplementation((_Entity: any, data: Record<string, unknown>) => ({
          id: 'new-id',
          createdAt: new Date(),
          ...data,
        })),
      persist: jest.fn().mockReturnThis(),
      flush: jest.fn(),
    };
    cacheService = {
      invalidateNamespace: jest.fn(),
      invalidateNamespaces: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionnaireTypeService,
        { provide: getRepositoryToken(QuestionnaireType), useValue: typeRepo },
        {
          provide: getRepositoryToken(Questionnaire),
          useValue: questionnaireRepo,
        },
        { provide: EntityManager, useValue: em },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get(QuestionnaireTypeService);
  });

  describe('Create', () => {
    it('should create a type with isSystem: false', async () => {
      const result = await service.Create({
        name: 'Peer Review',
        code: 'PEER_REVIEW',
        description: 'Peer teaching evaluation',
      });

      expect(result.isSystem).toBe(false);
      expect(result.code).toBe('PEER_REVIEW');
      expect(em.persist).toHaveBeenCalled();
      expect(cacheService.invalidateNamespace).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate code', async () => {
      em.flush.mockRejectedValueOnce(
        new UniqueConstraintViolationException(new Error('duplicate')),
      );

      await expect(
        service.Create({ name: 'Dup', code: 'DUP_CODE' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('FindAll', () => {
    it('should return all types', async () => {
      typeRepo.findAll.mockResolvedValue([
        { id: '1', code: 'A', isSystem: true },
        { id: '2', code: 'B', isSystem: false },
      ]);

      const result = await service.FindAll();
      expect(result).toHaveLength(2);
    });

    it('should filter by isSystem', async () => {
      typeRepo.findAll.mockResolvedValue([
        { id: '1', code: 'A', isSystem: true },
      ]);

      await service.FindAll({ isSystem: true });
      expect(typeRepo.findAll).toHaveBeenCalledWith({
        where: { isSystem: true },
        orderBy: { code: 'ASC' },
      });
    });
  });

  describe('FindOne', () => {
    it('should return type by ID', async () => {
      typeRepo.findOne.mockResolvedValue({ id: 'type-1', code: 'TEST' });

      const result = await service.FindOne('type-1');
      expect(result.id).toBe('type-1');
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      typeRepo.findOne.mockResolvedValue(null);

      await expect(service.FindOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Update', () => {
    it('should update name and description', async () => {
      const entity = { id: 'type-1', name: 'Old', description: 'Old desc' };
      typeRepo.findOne.mockResolvedValue(entity);

      const result = await service.Update('type-1', {
        name: 'New',
        description: 'New desc',
      });

      expect(result.name).toBe('New');
      expect(result.description).toBe('New desc');
      expect(cacheService.invalidateNamespaces).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      typeRepo.findOne.mockResolvedValue(null);

      await expect(service.Update('missing', { name: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Remove', () => {
    it('should soft-delete a custom type', async () => {
      const entity = {
        id: 'type-1',
        isSystem: false,
        SoftDelete: jest.fn(),
      };
      typeRepo.findOne.mockResolvedValue(entity);
      questionnaireRepo.findOne.mockResolvedValue(null);

      await service.Remove('type-1');

      expect(entity.SoftDelete).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
      expect(cacheService.invalidateNamespace).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for system types', async () => {
      typeRepo.findOne.mockResolvedValue({
        id: 'type-1',
        isSystem: true,
      });

      await expect(service.Remove('type-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ConflictException when type has associated questionnaires', async () => {
      typeRepo.findOne.mockResolvedValue({
        id: 'type-1',
        isSystem: false,
      });
      questionnaireRepo.findOne.mockResolvedValue({ id: 'q-1' });

      await expect(service.Remove('type-1')).rejects.toThrow(ConflictException);
    });
  });
});
