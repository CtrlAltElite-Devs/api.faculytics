export abstract class StorageProvider {
  abstract Upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void>;
  abstract GetPresignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string>;
  abstract Delete(key: string): Promise<void>;
  abstract DeleteByPrefix(prefix: string): Promise<void>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
