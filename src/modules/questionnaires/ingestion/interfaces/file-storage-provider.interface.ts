export interface FileStorageProvider {
  getStream(storageKey: string): Promise<NodeJS.ReadableStream>;
}
