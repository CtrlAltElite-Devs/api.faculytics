import { Readable } from 'stream';
import { CSVAdapter } from './csv.adapter';
import { CSVAdapterConfig } from '../types/csv-adapter-config.type';

describe('CSVAdapter', () => {
  let adapter: CSVAdapter;

  beforeEach(() => {
    adapter = new CSVAdapter();
  });

  it('should extract records from a valid CSV stream with normalized keys', async () => {
    const csvData = ` Name , Moodle ID 
John,123
Jane,456`;
    const stream = Readable.from(csvData);
    const config = { dryRun: false };

    const records = [];
    for await (const record of adapter.extract(stream, config)) {
      records.push(record);
    }

    expect(records).toHaveLength(2);
    expect(records[0].data).toEqual({ name: 'John', moodleid: '123' });
    expect(records[1].data).toEqual({ name: 'Jane', moodleid: '456' });
    expect(records[0].sourceIdentifier).toBe(1);
    expect(records[1].sourceIdentifier).toBe(2);
  });

  it('should handle key collisions during normalization', async () => {
    const csvData = `User ID,user_id,USERID
1,2,3`;
    const stream = Readable.from(csvData);
    const config = { dryRun: false };

    const records = [];
    for await (const record of adapter.extract(stream, config)) {
      records.push(record);
    }

    expect(records[0].data).toEqual({
      userid: '1',
      user_id: '2',
      userid_1: '3',
    });
  });

  it('should respect custom delimiters and quotes', async () => {
    const csvData = `Name;Role
"Doe; John";Admin`;
    const stream = Readable.from(csvData);
    const config: CSVAdapterConfig = {
      dryRun: false,
      delimiter: ';',
      quote: '"',
    };

    const records = [];
    for await (const record of adapter.extract(stream, config)) {
      records.push(record);
    }

    expect(records[0].data).toEqual({ name: 'Doe; John', role: 'Admin' });
  });

  it('should yield an error record for malformed CSV if parser fails', async () => {
    // We simulate a stream error
    const stream = new Readable({
      read() {
        this.push('Name,Age\n');
        this.destroy(new Error('Parse error'));
      },
    });
    const config: CSVAdapterConfig = { dryRun: false };

    const records = [];
    try {
      for await (const record of adapter.extract(stream, config)) {
        records.push(record);
      }
    } catch {
      // for-await might throw if the stream emits error and it's not caught inside extract
    }

    expect(records.some((r) => r.error === 'Parse error')).toBe(true);
  });

  it('should ensure the underlying stream is destroyed', async () => {
    const csvData = `a,b
1,2`;
    const stream = Readable.from(csvData);
    const destroySpy = jest.spyOn(stream, 'destroy');
    const config = { dryRun: false };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of adapter.extract(stream, config)) {
      break; // Abort early
    }

    expect(destroySpy).toHaveBeenCalled();
  });

  it('should handle backpressure with a slow consumer', async () => {
    const numRows = 100;
    let csvData = 'id,value\n';
    for (let i = 0; i < numRows; i++) {
      csvData += `${i},value_${i}\n`;
    }
    const stream = Readable.from(csvData);
    const config = { dryRun: false };

    let count = 0;
    for await (const record of adapter.extract(stream, config)) {
      count++;
      if (count % 10 === 0) {
        // Simulate slow processing
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(record.data).toBeDefined();
    }

    expect(count).toBe(numRows);
  });
});
