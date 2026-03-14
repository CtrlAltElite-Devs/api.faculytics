import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CacheNamespace } from './cache-namespaces';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly keyRegistry = new Map<CacheNamespace, Set<string>>();

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  private buildKey(namespace: CacheNamespace, suffix: string): string {
    return `${namespace}:${suffix}`;
  }

  private trackKey(namespace: CacheNamespace, key: string): void {
    if (!this.keyRegistry.has(namespace)) {
      this.keyRegistry.set(namespace, new Set());
    }
    this.keyRegistry.get(namespace)!.add(key);
  }

  async wrap<T>(
    namespace: CacheNamespace,
    suffix: string,
    fn: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const key = this.buildKey(namespace, suffix);
    this.trackKey(namespace, key);

    const cached = await this.cache.get<T>(key);
    if (cached !== undefined && cached !== null) {
      this.logger.log(`Cache HIT for key "${key}"`);
      return cached;
    }

    this.logger.log(`Cache MISS for key "${key}"`);
    return this.cache.wrap<T>(key, fn, ttlMs);
  }

  async invalidateNamespace(namespace: CacheNamespace): Promise<void> {
    const keys = this.keyRegistry.get(namespace);
    if (!keys || keys.size === 0) return;
    const keysArray = [...keys];
    await Promise.all(keysArray.map((k) => this.cache.del(k)));
    keys.clear();
    this.logger.log(
      `Invalidated ${keysArray.length} key(s) in namespace "${namespace}"`,
    );
  }

  async invalidateNamespaces(...namespaces: CacheNamespace[]): Promise<void> {
    await Promise.all(namespaces.map((ns) => this.invalidateNamespace(ns)));
  }
}
