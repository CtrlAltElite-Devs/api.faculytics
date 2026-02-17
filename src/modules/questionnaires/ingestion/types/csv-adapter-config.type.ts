import { SourceConfiguration } from './source-config.type';

export interface CSVAdapterConfig extends SourceConfiguration {
  delimiter?: string;
  quote?: string;
  escape?: string;
  separator?: string;
}
