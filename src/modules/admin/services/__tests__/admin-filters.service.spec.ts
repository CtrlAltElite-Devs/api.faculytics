import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { NotFoundException } from '@nestjs/common';
import { AdminFiltersService } from '../admin-filters.service';

describe('AdminFiltersService', () => {
  let service: AdminFiltersService;
  let em: { findOne: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    em = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFiltersService,
        { provide: EntityManager, useValue: em },
      ],
    }).compile();

    service = module.get(AdminFiltersService);
  });

  describe('GetFaculty', () => {
    it('should return deduplicated faculty members sorted by fullName', async () => {
      const user1 = {
        id: 'u1',
        userName: 'faculty1',
        firstName: 'Ana',
        lastName: 'Cruz',
        fullName: 'Ana Cruz',
      };
      const user2 = {
        id: 'u2',
        userName: 'faculty2',
        firstName: 'Ben',
        lastName: 'Reyes',
        fullName: 'Ben Reyes',
      };

      em.find.mockResolvedValue([
        { user: user1, role: 'editingteacher', isActive: true },
        { user: user2, role: 'editingteacher', isActive: true },
        { user: user1, role: 'editingteacher', isActive: true }, // duplicate
      ] as any);

      const result = await service.GetFaculty();

      expect(result).toHaveLength(2);
      expect(result[0].username).toBe('faculty1'); // Ana before Ben
      expect(result[1].username).toBe('faculty2');
      expect(result[0].fullName).toBe('Ana Cruz');
    });
  });

  describe('GetCoursesForFaculty', () => {
    it('should return courses for a valid faculty username', async () => {
      const user = { id: 'u1', userName: 'prof.santos' };
      const course = {
        id: 'c1',
        shortname: 'CS101',
        fullname: 'Intro to Programming',
      };

      em.findOne.mockResolvedValue(user as any);
      em.find.mockResolvedValue([{ course }] as any);

      const result = await service.GetCoursesForFaculty('prof.santos');

      expect(result).toHaveLength(1);
      expect(result[0].shortname).toBe('CS101');
      expect(result[0].fullname).toBe('Intro to Programming');
    });

    it('should throw NotFoundException for unknown username', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.GetCoursesForFaculty('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GetQuestionnaireTypes', () => {
    it('should return all types mapped via FilterOptionResponseDto', async () => {
      const types = [
        { id: 't1', code: 'FIC', name: 'Faculty In Classroom' },
        { id: 't2', code: 'FOC', name: 'Faculty Out of Classroom' },
      ];

      em.find.mockResolvedValue(types as any);

      const result = await service.GetQuestionnaireTypes();

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('FIC');
      expect(result[0].name).toBe('Faculty In Classroom');
    });
  });

  describe('GetQuestionnaireVersions', () => {
    it('should return active versions for a given type', async () => {
      em.findOne.mockResolvedValue({ id: 't1' } as any);
      em.find.mockResolvedValue([
        { id: 'v1', versionNumber: 1, isActive: true },
        { id: 'v2', versionNumber: 2, isActive: true },
      ] as any);

      const result = await service.GetQuestionnaireVersions('t1');

      expect(result).toHaveLength(2);
      expect(result[0].versionNumber).toBe(1);
      expect(result[0].isActive).toBe(true);
    });

    it('should throw NotFoundException for unknown type ID', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.GetQuestionnaireVersions('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
