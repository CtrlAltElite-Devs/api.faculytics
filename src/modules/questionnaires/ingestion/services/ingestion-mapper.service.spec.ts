import { Test, TestingModule } from '@nestjs/testing';
import { IngestionMapperService } from './ingestion-mapper.service';
import { IngestionMappingLoader } from 'src/modules/common/data-loaders/ingestion-mapping.loader';
import { RawSubmissionData } from '../dto/raw-submission-data.dto';
import { User } from 'src/entities/user.entity';
import { Course } from 'src/entities/course.entity';

describe('IngestionMapperService', () => {
  let service: IngestionMapperService;
  let loader: jest.Mocked<IngestionMappingLoader>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionMapperService,
        {
          provide: IngestionMappingLoader,
          useValue: {
            loadUser: jest.fn(),
            loadCourse: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IngestionMapperService>(IngestionMapperService);
    loader = module.get(IngestionMappingLoader);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should map valid raw data correctly', async () => {
    const mockUser = { id: 'user-1' } as Partial<User>;
    const mockFaculty = { id: 'faculty-1' } as Partial<User>;
    const mockCourse = {
      id: 'course-1',
      shortname: 'C1',
      program: { department: { semester: { id: 'sem-1' } } },
    } as Partial<Course>;

    loader.loadUser.mockImplementation((id) => {
      if (id === 101) return Promise.resolve(mockUser as User);
      if (id === 201) return Promise.resolve(mockFaculty as User);
      return Promise.resolve(null);
    });
    loader.loadCourse.mockResolvedValue(mockCourse as Course);

    const rawData: RawSubmissionData = {
      externalId: 'ext-1',
      moodleUserId: 101,
      moodleFacultyId: 201,
      courseId: 301,
      answers: [{ questionId: 'q1', value: 5 }],
    };

    const result = await service.map(rawData, 'v1');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      versionId: 'v1',
      respondentId: 'user-1',
      facultyId: 'faculty-1',
      semesterId: 'sem-1',
      courseId: 'course-1',
      answers: { q1: 5 },
      externalId: 'ext-1',
    });
  });

  it('should return failure if respondent not found', async () => {
    loader.loadUser.mockResolvedValue(null);
    const rawData: RawSubmissionData = {
      externalId: 'ext-1',
      moodleUserId: 101,
      moodleFacultyId: 201,
      courseId: 301,
      answers: [],
    };
    const result = await service.map(rawData, 'v1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Respondent with Moodle ID 101 not found.');
  });
});
