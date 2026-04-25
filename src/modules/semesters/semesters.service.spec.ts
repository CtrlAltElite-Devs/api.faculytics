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
    const s2Start = new Date(Date.UTC(2026, 0, 20));
    const s2End = new Date(Date.UTC(2026, 5, 1));
    const s1Start = new Date(Date.UTC(2025, 7, 1));
    const s1End = new Date(Date.UTC(2025, 11, 18));

    const mockSemesters = [
      {
        id: 'sem-1',
        code: 'S22526',
        label: 'Semester 2',
        academicYear: '2025-2026',
        startDate: s2Start,
        endDate: s2End,
        campus: { id: 'campus-1', code: 'UCMN', name: 'UC Main' },
      },
      {
        id: 'sem-2',
        code: 'S22526',
        label: 'Semester 2',
        academicYear: '2025-2026',
        startDate: s2Start,
        endDate: s2End,
        campus: { id: 'campus-2', code: 'UCB', name: 'UC Banilad' },
      },
    ];

    it('should return all semesters with campus info and dates', async () => {
      em.find.mockResolvedValue(mockSemesters);

      const result = await service.listSemesters({});

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: 'sem-1',
        code: 'S22526',
        label: 'Semester 2',
        academicYear: '2025-2026',
        startDate: s2Start,
        endDate: s2End,
        campus: { id: 'campus-1', code: 'UCMN', name: 'UC Main' },
      });
      expect(result.data[1].campus.code).toBe('UCB');
    });

    it('should order by startDate DESC so the current academic term comes first', async () => {
      em.find.mockResolvedValue([]);

      await service.listSemesters({});

      expect(em.find).toHaveBeenCalledWith(
        Semester,
        {},
        {
          populate: ['campus'],
          orderBy: { startDate: 'DESC' },
        },
      );
    });

    it('should filter by campus when campusId is provided', async () => {
      em.find.mockResolvedValue([mockSemesters[0]]);

      const result = await service.listSemesters({ campusId: 'campus-1' });

      expect(em.find).toHaveBeenCalledWith(
        Semester,
        { campus: 'campus-1' },
        {
          populate: ['campus'],
          orderBy: { startDate: 'DESC' },
        },
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].campus.code).toBe('UCMN');
    });

    it('should pass through nullable endDate', async () => {
      em.find.mockResolvedValue([
        {
          ...mockSemesters[0],
          endDate: undefined,
        },
      ]);

      const result = await service.listSemesters({});

      expect(result.data[0].endDate).toBeUndefined();
      expect(result.data[0].startDate).toEqual(s2Start);
    });

    it('should return empty data when no semesters exist', async () => {
      em.find.mockResolvedValue([]);

      const result = await service.listSemesters({});

      expect(result.data).toEqual([]);
    });

    it('should preserve backend ordering (S22526 before S12526 when S2 starts later)', async () => {
      em.find.mockResolvedValue([
        mockSemesters[0],
        {
          id: 'sem-3',
          code: 'S12526',
          label: 'Semester 1',
          academicYear: '2025-2026',
          startDate: s1Start,
          endDate: s1End,
          campus: { id: 'campus-1', code: 'UCMN', name: 'UC Main' },
        },
      ]);

      const result = await service.listSemesters({});

      expect(result.data[0].code).toBe('S22526');
      expect(result.data[1].code).toBe('S12526');
    });
  });
});
