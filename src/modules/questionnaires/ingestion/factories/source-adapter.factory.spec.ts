import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { SourceAdapterFactory } from './source-adapter.factory';
import { SourceType } from '../types/source-type.enum';
import { IngestionRecord } from '../interfaces/ingestion-record.interface';

describe('SourceAdapterFactory', () => {
  let factory: SourceAdapterFactory;
  let moduleRef: ModuleRef;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourceAdapterFactory,
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    factory = module.get<SourceAdapterFactory>(SourceAdapterFactory);
    moduleRef = module.get<ModuleRef>(ModuleRef);
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  it('should return an adapter if found', () => {
    const mockAdapter = { extract: jest.fn() };
    (moduleRef.get as jest.Mock).mockReturnValue(mockAdapter);

    const result = factory.Create(SourceType.CSV);

    expect(result).toBe(mockAdapter);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(moduleRef.get).toHaveBeenCalledWith('SOURCE_ADAPTER_CSV', {
      strict: false,
    });
  });

  it('should throw an error if adapter not found', () => {
    (moduleRef.get as jest.Mock).mockImplementation(() => {
      throw new Error();
    });

    expect(() => factory.Create(SourceType.API)).toThrow(
      'No adapter found for source type: API',
    );
  });

  it('should work with an AsyncIterable from a mock adapter', async () => {
    const mockAdapter = {
      // eslint-disable-next-line @typescript-eslint/require-await
      async *extract() {
        yield { data: { externalId: '1' }, sourceIdentifier: 1 };
        yield { data: { externalId: '2' }, sourceIdentifier: 2 };
      },
      close: jest.fn().mockResolvedValue(undefined),
    };
    (moduleRef.get as jest.Mock).mockReturnValue(mockAdapter);

    const adapter = factory.Create<
      Record<string, unknown>,
      { externalId: string }
    >(SourceType.CSV);
    const results: IngestionRecord<{ externalId: string }>[] = [];
    for await (const record of adapter.extract({}, { dryRun: false })) {
      results.push(record);
    }

    if (adapter.close) {
      await adapter.close();
    }

    expect(results).toHaveLength(2);
    expect(results[0].data?.externalId).toBe('1');
    expect(results[1].data?.externalId).toBe('2');
    expect(mockAdapter.close).toHaveBeenCalled();
  });
});
