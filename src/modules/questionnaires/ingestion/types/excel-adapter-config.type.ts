import { SourceConfiguration } from '../types/source-config.type';

export interface ExcelAdapterConfig extends SourceConfiguration {
  sheetName?: string;
  sheetIndex?: number;
}
