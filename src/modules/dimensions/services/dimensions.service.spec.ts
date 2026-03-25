import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/postgresql';
import { DimensionsService } from './dimensions.service';
import { DimensionRepository } from 'src/repositories/dimension.repository';
import { QuestionnaireType } from 'src/modules/questionnaires/lib/questionnaire.types';

describe('DimensionsService', () => {
  let service: DimensionsService;
  let dimensionRepository: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
  };
  let em: {
    create: jest.Mock;
    persist: jest.Mock;
    flush: jest.Mock;
  };

  const mockDimension = {
    id: 'dim-1',
    code: 'TEACHING_QUALITY',
    displayName: 'Teaching Quality',
    questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    dimensionRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };

    const flushMock = jest.fn();
    em = {
      create: jest.fn().mockReturnValue({ ...mockDimension }),
      persist: jest.fn().mockReturnValue({ flush: flushMock }),
      flush: flushMock,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DimensionsService,
        { provide: DimensionRepository, useValue: dimensionRepository },
        { provide: EntityManager, useValue: em },
      ],
    }).compile();

    service = module.get(DimensionsService);
  });

  describe('create', () => {
    it('should create a dimension with explicit code', async () => {
      const dto = {
        code: 'COURSE_CONTENT',
        displayName: 'Course Content',
        questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
      };

      const result = await service.create(dto);

      expect(em.create).toHaveBeenCalledWith(expect.anything(), {
        code: 'COURSE_CONTENT',
        displayName: 'Course Content',
        questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
        active: true,
      });
      expect(em.persist).toHaveBeenCalled();
      expect(result.id).toBe('dim-1');
    });

    it('should auto-generate code from displayName when code is omitted', async () => {
      const dto = {
        displayName: 'Teaching Quality',
        questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
      };

      await service.create(dto);

      expect(em.create).toHaveBeenCalledWith(expect.anything(), {
        code: 'TEACHING_QUALITY',
        displayName: 'Teaching Quality',
        questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
        active: true,
      });
    });

    it('should throw ConflictException on duplicate [code, questionnaireType]', async () => {
      const rejectingFlush = jest
        .fn()
        .mockRejectedValue(
          new UniqueConstraintViolationException(new Error('duplicate')),
        );
      em.persist.mockReturnValue({ flush: rejectingFlush });

      await expect(
        service.create({
          code: 'TEACHING_QUALITY',
          displayName: 'Teaching Quality',
          questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      dimensionRepository.findAndCount.mockResolvedValue([[mockDimension], 1]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        totalItems: 1,
        itemCount: 1,
        itemsPerPage: 20,
        totalPages: 1,
        currentPage: 1,
      });
    });

    it('should apply questionnaireType filter', async () => {
      dimensionRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM,
        page: 1,
        limit: 20,
      });

      expect(dimensionRepository.findAndCount).toHaveBeenCalledWith(
        { questionnaireType: QuestionnaireType.FACULTY_IN_CLASSROOM },
        expect.objectContaining({ limit: 20, offset: 0 }),
      );
    });

    it('should apply active=true filter', async () => {
      dimensionRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ active: true, page: 1, limit: 20 });

      expect(dimensionRepository.findAndCount).toHaveBeenCalledWith(
        { active: true },
        expect.anything(),
      );
    });

    it('should apply active=false filter', async () => {
      dimensionRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ active: false, page: 1, limit: 20 });

      expect(dimensionRepository.findAndCount).toHaveBeenCalledWith(
        { active: false },
        expect.anything(),
      );
    });

    it('should return empty results', async () => {
      dimensionRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return the dimension when found', async () => {
      dimensionRepository.findOne.mockResolvedValue(mockDimension);

      const result = await service.findOne('dim-1');
      expect(result.id).toBe('dim-1');
    });

    it('should throw NotFoundException when not found', async () => {
      dimensionRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update displayName', async () => {
      const dimension = { ...mockDimension };
      dimensionRepository.findOne.mockResolvedValue(dimension);

      const result = await service.update('dim-1', {
        displayName: 'Updated Name',
      });

      expect(dimension.displayName).toBe('Updated Name');
      expect(em.flush).toHaveBeenCalled();
      expect(result.displayName).toBe('Updated Name');
    });

    it('should throw NotFoundException when dimension not found', async () => {
      dimensionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('missing', { displayName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an active dimension', async () => {
      const dimension = { ...mockDimension, active: true };
      dimensionRepository.findOne.mockResolvedValue(dimension);

      const result = await service.deactivate('dim-1');

      expect(dimension.active).toBe(false);
      expect(em.flush).toHaveBeenCalled();
      expect(result.active).toBe(false);
    });

    it('should throw BadRequestException when already inactive', async () => {
      dimensionRepository.findOne.mockResolvedValue({
        ...mockDimension,
        active: false,
      });

      await expect(service.deactivate('dim-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when not found', async () => {
      dimensionRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivate('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activate', () => {
    it('should activate an inactive dimension', async () => {
      const dimension = { ...mockDimension, active: false };
      dimensionRepository.findOne.mockResolvedValue(dimension);

      const result = await service.activate('dim-1');

      expect(dimension.active).toBe(true);
      expect(em.flush).toHaveBeenCalled();
      expect(result.active).toBe(true);
    });

    it('should throw BadRequestException when already active', async () => {
      dimensionRepository.findOne.mockResolvedValue({
        ...mockDimension,
        active: true,
      });

      await expect(service.activate('dim-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when not found', async () => {
      dimensionRepository.findOne.mockResolvedValue(null);

      await expect(service.activate('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
