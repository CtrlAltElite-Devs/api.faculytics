import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { SemestersService } from './semesters.service';
import { Semester } from '../../entities/semester.entity';

describe('SemestersService', () => {
  let service: SemestersService;
  let em: { find: jest.Mock };

  beforeEach(async () => {
    em = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SemestersService, { provide: EntityManager, useValue: em }],
    }).compile();

    service = module.get<SemestersService>(SemestersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listSemesters', () => {
    const mockSemesters = [
      {
        id: 'sem-1',
        code: 'S22526',
        label: 'Semester 2',
        academicYear: '2025-2026',
        campus: { id: 'campus-1', code: 'UCMN', name: 'UC Main' },
      },
      {
        id: 'sem-2',
        code: 'S22526',
        label: 'Semester 2',
        academicYear: '2025-2026',
        campus: { id: 'campus-2', code: 'UCB', name: 'UC Banilad' },
      },
    ];

    it('should return all semesters with campus info', async () => {
      em.find.mockResolvedValue(mockSemesters);

      const result = await service.listSemesters();

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: 'sem-1',
        code: 'S22526',
        label: 'Semester 2',
        academicYear: '2025-2026',
        campus: { id: 'campus-1', code: 'UCMN', name: 'UC Main' },
      });
      expect(result.data[1].campus.code).toBe('UCB');
    });

    it('should call find with correct options', async () => {
      em.find.mockResolvedValue([]);

      await service.listSemesters();

      expect(em.find).toHaveBeenCalledWith(
        Semester,
        {},
        {
          populate: ['campus'],
          orderBy: { createdAt: 'DESC' },
        },
      );
    });

    it('should return empty data when no semesters exist', async () => {
      em.find.mockResolvedValue([]);

      const result = await service.listSemesters();

      expect(result.data).toEqual([]);
    });
  });
});
