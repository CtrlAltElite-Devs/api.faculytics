import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { MoodleService } from '../moodle/moodle.service';
import { MoodleSyncService } from '../moodle/moodle-sync.service';
import { CustomJwtService } from '../common/custom-jwt-service';
import UnitOfWork from '../common/unit-of-work';

describe('AuthService', () => {
  let service: AuthService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let moodleService: MoodleService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let moodleSyncService: MoodleSyncService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let jwtService: CustomJwtService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let unitOfWork: UnitOfWork;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: MoodleService,
          useValue: {
            // TODO: Mock methods
          },
        },
        {
          provide: MoodleSyncService,
          useValue: {
            // TODO: Mock methods
          },
        },
        {
          provide: CustomJwtService,
          useValue: {
            // TODO: Mock methods
          },
        },
        {
          provide: UnitOfWork,
          useValue: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            runInTransaction: jest
              .fn()
              .mockImplementation((cb: (em: any) => any) =>
                cb({ getRepository: jest.fn() }),
              ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    moodleService = module.get<MoodleService>(MoodleService);
    moodleSyncService = module.get<MoodleSyncService>(MoodleSyncService);
    jwtService = module.get<CustomJwtService>(CustomJwtService);
    unitOfWork = module.get<UnitOfWork>(UnitOfWork);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
