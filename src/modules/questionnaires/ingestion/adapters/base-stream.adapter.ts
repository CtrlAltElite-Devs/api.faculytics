import { IngestionRecord } from '../interfaces/ingestion-record.interface';
import { SourceAdapter } from '../interfaces/source-adapter.interface';
import { SourceConfiguration } from '../types/source-config.type';

function isDestroyable(
  stream: any,
): stream is { destroy: (error?: Error) => void } {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return typeof stream.destroy === 'function';
}

export abstract class BaseStreamAdapter<
  TPayload extends NodeJS.ReadableStream,
  TData = unknown,
> implements SourceAdapter<TPayload, TData> {
  abstract extract(
    payload: TPayload,
    config: SourceConfiguration,
  ): AsyncIterable<IngestionRecord<TData>>;

  /**
   * Normalizes keys for DTO compatibility:
   * 1. Trim whitespace
   * 2. Lowercase
   * 3. Remove spaces
   * 4. Collision detection with suffix
   */
  protected normalizeKey(
    key: unknown,
    existingKeys: Set<string>,
    fallbackPrefix = 'empty_header',
  ): string {
    const stringKey =
      key === null || key === undefined
        ? ''
        : typeof key === 'string'
          ? key
          : typeof key === 'number' ||
              typeof key === 'boolean' ||
              typeof key === 'bigint'
            ? String(key)
            : '';
    let normalized = stringKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');

    if (!normalized) {
      normalized = fallbackPrefix;
    }

    if (existingKeys.has(normalized)) {
      let counter = 1;
      let newKey = `${normalized}_${counter}`;
      while (existingKeys.has(newKey)) {
        counter++;
        newKey = `${normalized}_${counter}`;
      }
      normalized = newKey;
    }

    existingKeys.add(normalized);
    return normalized;
  }

  protected cleanupStream(stream: NodeJS.ReadableStream): void {
    // Check if the stream has a destroy method and call it.
    // This is common for Readable streams to release resources.
    if (isDestroyable(stream)) {
      stream.destroy();
    }
  }
}
