import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { Program } from 'src/entities/program.entity';
import { AdminFiltersService } from './admin-filters.service';
import { ProgramFilterOptionResponseDto } from '../dto/responses/program-filter-option.response.dto';

describe('AdminFiltersService', () => {
  let service: AdminFiltersService;
  let em: { find: jest.Mock };

  beforeEach(async () => {
    em = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFiltersService,
        { provide: EntityManager, useValue: em },
      ],
    }).compile();

    service = module.get(AdminFiltersService);
  });

  describe('GetPrograms', () => {
    it('should map moodleCategoryId via ProgramFilterOptionResponseDto', async () => {
      const programEntity = {
        id: 'p-1',
        code: 'BSCS',
        name: 'Computer Science',
        moodleCategoryId: 42,
      };
      em.find.mockResolvedValue([programEntity]);

      const result = await service.GetPrograms('d-1');

      expect(em.find).toHaveBeenCalledWith(
        Program,
        { department: 'd-1' },
        { orderBy: { code: 'ASC' } },
      );
      expect(result).toHaveLength(1);
      expect(result[0].moodleCategoryId).toBe(42);
      expect(result[0].id).toBe('p-1');
      expect(result[0].code).toBe('BSCS');
      expect(result[0].name).toBe('Computer Science');
      expect(result[0]).toBeInstanceOf(ProgramFilterOptionResponseDto);
    });

    it('should map name to null when entity name is undefined', async () => {
      const programEntity = {
        id: 'p-2',
        code: 'BSIT',
        moodleCategoryId: 55,
      };
      em.find.mockResolvedValue([programEntity]);

      const result = await service.GetPrograms();

      expect(em.find).toHaveBeenCalledWith(
        Program,
        {},
        { orderBy: { code: 'ASC' } },
      );
      expect(result[0].name).toBeNull();
      expect(result[0].moodleCategoryId).toBe(55);
    });
  });
});
