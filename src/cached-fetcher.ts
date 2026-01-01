/**
 * CachedFetcher - A drop-in replacement for Fetcher that uses SparseCache
 * 
 * This class maintains the same interface as Fetcher but routes all requests
 * through the SparseCache for local caching with intelligent cache management.
 * 
 * Key behaviors:
 * - First request initializes cache metadata from upstream
 * - Subsequent requests serve from cache where available
 * - Missing byte ranges are fetched and cached
 * - Periodic validation checks against upstream for staleness
 * - Falls through to network on cache failures
 */

import { SparseCache, getSharedSparseCache, type SparseCacheOptions, type UpstreamFetcher } from './sparse-cache.js';
import { getSharedMirrorManager } from './mirror-manager.js';
import type { FetcherStats, FetcherOptions, LogCallback, MirrorManagerInterface, Mirror } from './types.js';

/**
 * Adapter to use MirrorManager as an UpstreamFetcher for SparseCache
 */
class MirrorUpstreamAdapter implements UpstreamFetcher {
  private mirrorManager: MirrorManagerInterface;
  private logCallback: LogCallback | null;

  constructor(mirrorManager: MirrorManagerInterface, logCallback?: LogCallback | null) {
    this.mirrorManager = mirrorManager;
    this.logCallback = logCallback || null;
  }

  async head(bookId: number): Promise<{ size: number; etag: string | null; lastModified: string | null }> {
    const result = await this.mirrorManager.headWithFallback(bookId, this.logCallback);
    // Note: headWithFallback returns contentLength but not etag/lastModified
    // We'd need to extend the interface or make a separate call
    // For now, return null for validation headers
    return {
      size: result.contentLength,
      etag: null,
      lastModified: null
    };
  }

  async getRange(bookId: number, start: number, end: number): Promise<Buffer> {
    const result = await this.mirrorManager.getWithFallback(
      bookId,
      { range: `bytes=${start}-${end}` },
      this.logCallback
    );
    return result.body;
  }
}

export interface CachedFetcherOptions extends FetcherOptions {
  sparseCache?: SparseCache;
  sparseCacheOptions?: SparseCacheOptions;
}

export class CachedFetcher {
  public bookId: number;
  private debug: boolean;
  public requestCount = 0;
  public totalBytesDownloaded = 0;
  private totalBytes: number | null = null;

  // Mirror support
  private useMirrors: boolean;
  private mirrorManager: MirrorManagerInterface | null;
  private currentMirror: Mirror | null = null;
  private logCallback: LogCallback | null;

  // Sparse cache
  private sparseCache: SparseCache;

  // Stats tracking
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(bookId: number, debug = false, options: CachedFetcherOptions = {}) {
    this.bookId = bookId;
    this.debug = debug;
    this.useMirrors = options.useMirrors !== false;
    this.mirrorManager = options.mirrorManager || null;
    this.logCallback = options.logCallback || null;

    // Initialize sparse cache
    if (options.sparseCache) {
      this.sparseCache = options.sparseCache;
    } else {
      this.sparseCache = getSharedSparseCache(options.sparseCacheOptions);
    }

    // If using mirrors, wire them up as the upstream for the cache
    if (this.useMirrors) {
      const mm = this.mirrorManager || getSharedMirrorManager({ debug });
      const adapter = new MirrorUpstreamAdapter(mm, this.logCallback);
      this.sparseCache.setUpstreamFetcher(adapter);
    }
  }

  private _log(message: string): void {
    if (this.debug) {
      console.error(`[CachedFetcher ${this.bookId}] ${message}`);
    }
  }

  async getFileSize(): Promise<number> {
    if (this.totalBytes !== null) return this.totalBytes;

    try {
      this.totalBytes = await this.sparseCache.getFileSize(this.bookId);
      this._log(`File size: ${this.totalBytes} bytes`);
      return this.totalBytes;
    } catch (err) {
      this._log(`getFileSize failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async fetchRange(startByte: number, endByte: number, retries = 3): Promise<Buffer> {
    this.requestCount++;
    const requestSize = endByte - startByte + 1;

    if (this.debug) {
      console.error(`[CachedFetcher] Request #${this.requestCount}: bytes ${startByte}-${endByte} (${requestSize} bytes)`);
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const statsBefore = this.sparseCache.getStats();
        const result = await this.sparseCache.getRange(this.bookId, startByte, endByte);
        const statsAfter = this.sparseCache.getStats();

        // Track what came from cache vs network
        const newCacheBytes = statsAfter.bytesFromCache - statsBefore.bytesFromCache;
        const newNetworkBytes = statsAfter.bytesFromNetwork - statsBefore.bytesFromNetwork;

        if (newCacheBytes > 0) {
          this.cacheHits++;
          this._log(`Cache hit: ${newCacheBytes} bytes from cache`);
        }
        if (newNetworkBytes > 0) {
          this.cacheMisses++;
          this.totalBytesDownloaded += newNetworkBytes;
          this._log(`Cache miss: ${newNetworkBytes} bytes from network`);
        }

        return result;
      } catch (err) {
        this._log(`Attempt ${attempt + 1} failed: ${(err as Error).message}`);
        if (attempt === retries - 1) throw err;
        await this._sleep(500 * (attempt + 1));
      }
    }

    throw new Error('Fetch failed after all retries');
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): FetcherStats {
    return {
      requests: this.requestCount,
      bytesDownloaded: this.totalBytesDownloaded,
      totalBytes: this.totalBytes,
      efficiency: this.totalBytes 
        ? ((this.totalBytesDownloaded / this.totalBytes) * 100).toFixed(2) + '%' 
        : 'N/A',
      mirror: this.currentMirror ? this.currentMirror.provider : 'sparse-cache'
    };
  }

  getCacheStats(): {
    cacheHits: number;
    cacheMisses: number;
    hitRate: number;
    bookStats: ReturnType<SparseCache['getBookStats']>;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
      bookStats: this.sparseCache.getBookStats(this.bookId)
    };
  }

  getCurrentMirror(): Mirror | null {
    return this.currentMirror;
  }

  /**
   * Force cache validation against upstream
   */
  async validateCache(): Promise<boolean> {
    return this.sparseCache.forceValidation(this.bookId);
  }

  /**
   * Invalidate cache for this book
   */
  async invalidateCache(): Promise<void> {
    return this.sparseCache.invalidate(this.bookId);
  }
}

// ============================================================================
// Factory function for easy switching between cached and uncached
// ============================================================================

import { Fetcher } from './fetcher.js';

export interface FetcherFactoryOptions extends CachedFetcherOptions {
  useCache?: boolean;
}

/**
 * Create either a CachedFetcher or regular Fetcher based on options
 */
export function createFetcher(
  bookId: number,
  debug = false,
  options: FetcherFactoryOptions = {}
): Fetcher | CachedFetcher {
  if (options.useCache !== false) {
    return new CachedFetcher(bookId, debug, options);
  }
  return new Fetcher(bookId, debug, options);
}
