import { Request } from 'express';

export interface EnrichedRequest extends Request {
  metaData: RequestMetadata;
}

export type RequestMetadata = {
  browserName: string;
  os: string;
  ipAddress: string;
};
