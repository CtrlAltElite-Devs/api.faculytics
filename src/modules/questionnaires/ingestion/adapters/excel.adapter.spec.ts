import * as Excel from 'exceljs';
import { PassThrough } from 'stream';
import { ExcelAdapter } from './excel.adapter';
import { ExcelAdapterConfig } from '../types/excel-adapter-config.type';

describe('ExcelAdapter', () => {
  let adapter: ExcelAdapter;

  beforeEach(() => {
    adapter = new ExcelAdapter();
  });

  async function createExcelBuffer(
    data: any[][],
    sheetName = 'Sheet1',
  ): Promise<Buffer> {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    data.forEach((row) => worksheet.addRow(row));
    return (await workbook.xlsx.writeBuffer()) as Buffer;
  }

  it('should extract records from a valid Excel stream with normalized keys', async () => {
    const data = [
      [' Name ', ' Moodle ID '],
      ['John', '123'],
      ['Jane', '456'],
    ];
    const buffer = await createExcelBuffer(data);
    const stream = new PassThrough();
    stream.end(buffer);

    const config = { dryRun: false };

    const records = [];
    for await (const record of adapter.extract(stream, config)) {
      records.push(record);
    }

    expect(records).toHaveLength(2);
    expect(records[0].data).toEqual({ name: 'John', moodleid: '123' });
    expect(records[1].data).toEqual({ name: 'Jane', moodleid: '456' });
    expect(records[0].sourceIdentifier).toBe(1);
  });

  it('should filter by sheet name', async () => {
    const workbook = new Excel.Workbook();
    const sheet1 = workbook.addWorksheet('Sheet1');
    sheet1.addRow(['Header1']);
    sheet1.addRow(['Value1']);

    const targetSheet = workbook.addWorksheet('Target');
    targetSheet.addRow(['Header2']);
    targetSheet.addRow(['Value2']);

    const buffer = await workbook.xlsx.writeBuffer();
    const stream = new PassThrough();
    stream.end(buffer);

    const config: ExcelAdapterConfig = {
      dryRun: false,
      sheetName: 'Target',
    };

    const records = [];
    for await (const record of adapter.extract(stream, config)) {
      records.push(record);
    }

    expect(records).toHaveLength(1);
    expect(records[0].data).toEqual({ header2: 'Value2' });
  });

  it('should handle sheet index', async () => {
    const workbook = new Excel.Workbook();
    const sheet1 = workbook.addWorksheet('Sheet1');
    sheet1.addRow(['Header1']);
    sheet1.addRow(['Value1']);

    const sheet2 = workbook.addWorksheet('Sheet2');
    sheet2.addRow(['Header2']);
    sheet2.addRow(['Value2']);

    const buffer = await workbook.xlsx.writeBuffer();
    const stream = new PassThrough();
    stream.end(buffer);

    const config: ExcelAdapterConfig = {
      dryRun: false,
      sheetIndex: 2,
    };

    const records = [];
    for await (const record of adapter.extract(stream, config)) {
      records.push(record);
    }

    expect(records).toHaveLength(1);
    expect(records[0].data).toEqual({ header2: 'Value2' });
  });

  it('should ensure stream is destroyed after processing', async () => {
    const data = [['Header'], ['Value']];
    const buffer = await createExcelBuffer(data);
    const stream = new PassThrough();
    stream.end(buffer);
    const destroySpy = jest.spyOn(stream, 'destroy');

    const config = { dryRun: false };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of adapter.extract(stream, config)) {
      break;
    }

    expect(destroySpy).toHaveBeenCalled();
  });

  it('should handle backpressure with a slow consumer', async () => {
    const numRows = 50;
    const data = [['id', 'value']];
    for (let i = 0; i < numRows; i++) {
      data.push([i, `value_${i}`]);
    }
    const buffer = await createExcelBuffer(data);
    const stream = new PassThrough();
    stream.end(buffer);

    const config: ExcelAdapterConfig = { dryRun: false };

    let count = 0;
    for await (const _record of adapter.extract(stream, config)) {
      count++;
      if (count % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(_record.data).toBeDefined();
    }

    expect(count).toBe(numRows);
  });
});
