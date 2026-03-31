import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { NotFoundException } from '@nestjs/common';
import { SemestersService } from './semesters.service';
import { Semester } from '../../entities/semester.entity';

describe('SemestersService', () => {
  let service: SemestersService;
  let em: { findOne: jest.Mock };

  beforeEach(async () => {
    em = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SemestersService, { provide: EntityManager, useValue: em }],
    }).compile();

    service = module.get<SemestersService>(SemestersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentSemester', () => {
    it('should return the latest semester', async () => {
      const mockSemester = {
        id: 'semester-uuid-1',
        code: 'S22526',
        label: 'Semester 2',
        academicYear: '2025-2026',
      };

      em.findOne.mockResolvedValue(mockSemester);

      const result = await service.getCurrentSemester();

      expect(result).toEqual({
        id: 'semester-uuid-1',
        code: 'S22526',
        label: 'Semester 2',
        academicYear: '2025-2026',
      });
    });

    it('should call findOne with correct entity and ordering', async () => {
      em.findOne.mockResolvedValue({
        id: 'id',
        code: 'S12526',
        label: 'Semester 1',
        academicYear: '2025-2026',
      });

      await service.getCurrentSemester();

      expect(em.findOne).toHaveBeenCalledWith(
        Semester,
        {},
        { orderBy: { createdAt: 'DESC' } },
      );
    });

    it('should throw NotFoundException when no semester exists', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.getCurrentSemester()).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
