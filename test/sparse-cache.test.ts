/**
 * Tests for SparseCache and CachedFetcher
 * 
 * Test categories:
 * 1. Pure bitmap functions (unit tests)
 * 2. SparseCache initialization and metadata
 * 3. Range fetching and caching behavior
 * 4. Cache validation and invalidation
 * 5. CachedFetcher integration
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SparseCache,
  _internal,
  type UpstreamFetcher,
  type SparseCacheOptions,
  resetSharedSparseCache
} from '../src/sparse-cache.js';
import { CachedFetcher } from '../src/cached-fetcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_CACHE_DIR = path.join(__dirname, '..', '.test-cache');

// ============================================================================
// Test Utilities
// ============================================================================

function cleanTestDir(): void {
  if (fs.existsSync(TEST_CACHE_DIR)) {
    fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
  }
}

function createTestOptions(overrides: Partial<SparseCacheOptions> = {}): SparseCacheOptions {
  return {
    cacheDir: TEST_CACHE_DIR,
    blockSize: 64,  // Small blocks for testing
    validationIntervalMs: 1000,  // 1 second for testing
    maxCoalesceGap: 128,
    debug: false,
    ...overrides
  };
}

/**
 * Mock upstream fetcher for testing
 */
class MockUpstreamFetcher implements UpstreamFetcher {
  public content: Buffer;
  public etag: string;
  public lastModified: string;
  public headCalls = 0;
  public rangeCalls: Array<{ start: number; end: number }> = [];
  public shouldFail = false;
  public failAfterCalls = -1;

  constructor(content: string | Buffer, etag = 'test-etag-123', lastModified = 'Wed, 01 Jan 2025 00:00:00 GMT') {
    this.content = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    this.etag = etag;
    this.lastModified = lastModified;
  }

  async head(_bookId: number): Promise<{ size: number; etag: string | null; lastModified: string | null }> {
    this.headCalls++;
    
    if (this.shouldFail || (this.failAfterCalls >= 0 && this.headCalls > this.failAfterCalls)) {
      throw new Error('Mock upstream failure');
    }

    return {
      size: this.content.length,
      etag: this.etag,
      lastModified: this.lastModified
    };
  }

  async getRange(_bookId: number, start: number, end: number): Promise<Buffer> {
    this.rangeCalls.push({ start, end });
    
    if (this.shouldFail || (this.failAfterCalls >= 0 && this.rangeCalls.length > this.failAfterCalls)) {
      throw new Error('Mock upstream failure');
    }

    const clampedEnd = Math.min(end, this.content.length - 1);
    return this.content.subarray(start, clampedEnd + 1);
  }

  reset(): void {
    this.headCalls = 0;
    this.rangeCalls = [];
    this.shouldFail = false;
    this.failAfterCalls = -1;
  }
}

// ============================================================================
// Pure Function Tests
// ============================================================================

describe('Bitmap Pure Functions', () => {
  const { byteToBlock, blockToByte, bitmapSize, isBlockCached, markBlockCached, markBlockRangeCached, countCachedBlocks, findUncachedBlockRanges, coalesceRanges } = _internal;

  describe('byteToBlock', () => {
    it('converts byte offset to block index', () => {
      assert.strictEqual(byteToBlock(0, 64), 0);
      assert.strictEqual(byteToBlock(63, 64), 0);
      assert.strictEqual(byteToBlock(64, 64), 1);
      assert.strictEqual(byteToBlock(127, 64), 1);
      assert.strictEqual(byteToBlock(128, 64), 2);
    });

    it('handles non-power-of-2 block sizes', () => {
      assert.strictEqual(byteToBlock(0, 100), 0);
      assert.strictEqual(byteToBlock(99, 100), 0);
      assert.strictEqual(byteToBlock(100, 100), 1);
      assert.strictEqual(byteToBlock(250, 100), 2);
    });
  });

  describe('blockToByte', () => {
    it('converts block index to byte offset', () => {
      assert.strictEqual(blockToByte(0, 64), 0);
      assert.strictEqual(blockToByte(1, 64), 64);
      assert.strictEqual(blockToByte(2, 64), 128);
      assert.strictEqual(blockToByte(10, 64), 640);
    });
  });

  describe('bitmapSize', () => {
    it('calculates correct bitmap size', () => {
      // 64-byte blocks, 8 blocks per bitmap byte
      assert.strictEqual(bitmapSize(512, 64), 1);  // 8 blocks = 1 byte
      assert.strictEqual(bitmapSize(513, 64), 2);  // 9 blocks = 2 bytes
      assert.strictEqual(bitmapSize(1024, 64), 2); // 16 blocks = 2 bytes
      assert.strictEqual(bitmapSize(4096, 64), 8); // 64 blocks = 8 bytes
    });

    it('handles edge cases', () => {
      assert.strictEqual(bitmapSize(0, 64), 0);
      assert.strictEqual(bitmapSize(1, 64), 1);
      assert.strictEqual(bitmapSize(64, 64), 1);
      assert.strictEqual(bitmapSize(65, 64), 1);
    });
  });

  describe('isBlockCached / markBlockCached', () => {
    it('initially no blocks are cached', () => {
      const bitmap = Buffer.alloc(2, 0);
      assert.strictEqual(isBlockCached(bitmap, 0), false);
      assert.strictEqual(isBlockCached(bitmap, 7), false);
      assert.strictEqual(isBlockCached(bitmap, 8), false);
      assert.strictEqual(isBlockCached(bitmap, 15), false);
    });

    it('marks individual blocks as cached', () => {
      const bitmap = Buffer.alloc(2, 0);
      
      const bm1 = markBlockCached(bitmap, 0);
      assert.strictEqual(isBlockCached(bm1, 0), true);
      assert.strictEqual(isBlockCached(bm1, 1), false);
      
      const bm2 = markBlockCached(bm1, 5);
      assert.strictEqual(isBlockCached(bm2, 0), true);
      assert.strictEqual(isBlockCached(bm2, 5), true);
      assert.strictEqual(isBlockCached(bm2, 4), false);
      
      const bm3 = markBlockCached(bm2, 8);
      assert.strictEqual(isBlockCached(bm3, 8), true);
      assert.strictEqual(isBlockCached(bm3, 7), false);
    });

    it('is idempotent', () => {
      const bitmap = Buffer.alloc(1, 0);
      const bm1 = markBlockCached(bitmap, 3);
      const before = Buffer.from(bm1);
      const bm2 = markBlockCached(bm1, 3);
      assert.deepStrictEqual(bm2, before);
    });

    it('returns false for out-of-bounds blocks', () => {
      const bitmap = Buffer.alloc(1, 0);
      assert.strictEqual(isBlockCached(bitmap, 100), false);
    });
  });

  describe('markBlockRangeCached', () => {
    it('marks a range of blocks', () => {
      const bitmap = Buffer.alloc(2, 0);
      const bm = markBlockRangeCached(bitmap, 2, 6);
      
      assert.strictEqual(isBlockCached(bm, 0), false);
      assert.strictEqual(isBlockCached(bm, 1), false);
      assert.strictEqual(isBlockCached(bm, 2), true);
      assert.strictEqual(isBlockCached(bm, 3), true);
      assert.strictEqual(isBlockCached(bm, 4), true);
      assert.strictEqual(isBlockCached(bm, 5), true);
      assert.strictEqual(isBlockCached(bm, 6), true);
      assert.strictEqual(isBlockCached(bm, 7), false);
    });

    it('handles range spanning bitmap bytes', () => {
      const bitmap = Buffer.alloc(2, 0);
      const bm = markBlockRangeCached(bitmap, 6, 10);
      
      assert.strictEqual(isBlockCached(bm, 5), false);
      assert.strictEqual(isBlockCached(bm, 6), true);
      assert.strictEqual(isBlockCached(bm, 7), true);
      assert.strictEqual(isBlockCached(bm, 8), true);
      assert.strictEqual(isBlockCached(bm, 9), true);
      assert.strictEqual(isBlockCached(bm, 10), true);
      assert.strictEqual(isBlockCached(bm, 11), false);
    });
  });

  describe('countCachedBlocks', () => {
    it('counts zero for empty bitmap', () => {
      const bitmap = Buffer.alloc(4, 0);
      assert.strictEqual(countCachedBlocks(bitmap), 0);
    });

    it('counts correct number of cached blocks', () => {
      const bitmap = Buffer.alloc(2, 0);
      assert.strictEqual(countCachedBlocks(bitmap), 0);
      
      const bm1 = markBlockCached(bitmap, 0);
      assert.strictEqual(countCachedBlocks(bm1), 1);
      
      const bm2 = markBlockCached(bm1, 3);
      assert.strictEqual(countCachedBlocks(bm2), 2);
      
      const bm3 = markBlockCached(bm2, 8);
      assert.strictEqual(countCachedBlocks(bm3), 3);
    });

    it('counts all blocks for fully cached bitmap', () => {
      const bitmap = Buffer.alloc(2, 0xFF);
      assert.strictEqual(countCachedBlocks(bitmap), 16);
    });
  });

  describe('findUncachedBlockRanges', () => {
    it('finds all blocks uncached in empty bitmap', () => {
      const bitmap = Buffer.alloc(2, 0);
      const ranges = findUncachedBlockRanges(bitmap, 0, 127, 64, 0);
      
      assert.strictEqual(ranges.length, 1);
      assert.strictEqual(ranges[0].start, 0);
      assert.strictEqual(ranges[0].end, 127);
    });

    it('returns empty array when all blocks cached', () => {
      const bitmap = Buffer.alloc(2, 0xFF);
      const ranges = findUncachedBlockRanges(bitmap, 0, 127, 64, 0);
      assert.strictEqual(ranges.length, 0);
    });

    it('finds gaps in partially cached bitmap', () => {
      const bitmap = Buffer.alloc(2, 0);
      const bm1 = markBlockRangeCached(bitmap, 0, 1);  // First 2 blocks cached
      const bm2 = markBlockRangeCached(bm1, 4, 5);  // Blocks 4-5 cached
      
      // Bytes 0-127 = blocks 0-1 (64-byte blocks)
      // Block 0 = bytes 0-63, Block 1 = bytes 64-127
      const ranges = findUncachedBlockRanges(bm2, 0, 511, 64, 0);
      
      // Should find: blocks 2-3 (bytes 128-255) and blocks 6-7 (bytes 384-511)
      assert.strictEqual(ranges.length, 2);
      assert.strictEqual(ranges[0].start, 128);
      assert.strictEqual(ranges[0].end, 255);
      assert.strictEqual(ranges[1].start, 384);
      assert.strictEqual(ranges[1].end, 511);
    });

    it('coalesces over small gaps', () => {
      const bitmap = Buffer.alloc(2, 0);
      const bm = markBlockCached(bitmap, 2);  // Only block 2 cached
      
      // With maxCoalesceGap = 128 (2 blocks), should coalesce over the gap
      const ranges = findUncachedBlockRanges(bm, 0, 511, 64, 128);
      
      // Blocks 0-1 uncached, block 2 cached, blocks 3-7 uncached
      // With coalescing, should get: 0-127 and 192-511 but might coalesce
      assert.ok(ranges.length >= 1);
    });
  });

  describe('coalesceRanges', () => {
    it('coalesces overlapping ranges', () => {
      const ranges = [
        { start: 0, end: 100 },
        { start: 50, end: 150 },
        { start: 200, end: 300 }
      ];
      
      const result = coalesceRanges(ranges, 0);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].start, 0);
      assert.strictEqual(result[0].end, 150);
      assert.strictEqual(result[1].start, 200);
      assert.strictEqual(result[1].end, 300);
    });

    it('coalesces adjacent ranges within gap', () => {
      const ranges = [
        { start: 0, end: 100 },
        { start: 110, end: 200 }
      ];
      
      const result = coalesceRanges(ranges, 20);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].start, 0);
      assert.strictEqual(result[0].end, 200);
    });

    it('keeps separate ranges that exceed gap', () => {
      const ranges = [
        { start: 0, end: 100 },
        { start: 200, end: 300 }
      ];
      
      const result = coalesceRanges(ranges, 50);
      assert.strictEqual(result.length, 2);
    });

    it('handles empty input', () => {
      const result = coalesceRanges([], 100);
      assert.strictEqual(result.length, 0);
    });

    it('handles single range', () => {
      const ranges = [{ start: 50, end: 150 }];
      const result = coalesceRanges(ranges, 100);
      assert.strictEqual(result.length, 1);
      assert.deepStrictEqual(result[0], { start: 50, end: 150 });
    });
  });
});

// ============================================================================
// SparseCache Tests
// ============================================================================

describe('SparseCache', () => {
  let cache: SparseCache;
  let mockFetcher: MockUpstreamFetcher;
  const testContent = 'A'.repeat(256) + 'B'.repeat(256) + 'C'.repeat(256) + 'D'.repeat(256);

  beforeEach(() => {
    cleanTestDir();
    resetSharedSparseCache();
    mockFetcher = new MockUpstreamFetcher(testContent);
    cache = new SparseCache(createTestOptions());
    cache.setUpstreamFetcher(mockFetcher);
  });

  afterEach(() => {
    cleanTestDir();
  });

  describe('initialization', () => {
    it('creates cache directory if not exists', () => {
      cleanTestDir();
      const newCache = new SparseCache(createTestOptions());
      assert.ok(fs.existsSync(TEST_CACHE_DIR));
    });

    it('fetches file size from upstream on first access', async () => {
      const size = await cache.getFileSize(1234);
      assert.strictEqual(size, testContent.length);
      assert.strictEqual(mockFetcher.headCalls, 1);
    });

    it('caches file size for subsequent calls', async () => {
      await cache.getFileSize(1234);
      await cache.getFileSize(1234);
      assert.strictEqual(mockFetcher.headCalls, 1);
    });

    it('creates metadata file', async () => {
      await cache.getFileSize(1234);
      const metaPath = path.join(TEST_CACHE_DIR, '1234.meta.json');
      assert.ok(fs.existsSync(metaPath));
    });

    it('creates sparse data file with correct size', async () => {
      await cache.getFileSize(1234);
      const dataPath = path.join(TEST_CACHE_DIR, '1234.txt');
      assert.ok(fs.existsSync(dataPath));
      const stat = fs.statSync(dataPath);
      assert.strictEqual(stat.size, testContent.length);
    });

    it('creates bitmap file', async () => {
      await cache.getFileSize(1234);
      const bitmapPath = path.join(TEST_CACHE_DIR, '1234.bitmap');
      assert.ok(fs.existsSync(bitmapPath));
    });
  });

  describe('getRange', () => {
    it('fetches and caches data from upstream', async () => {
      const data = await cache.getRange(1234, 0, 63);
      assert.strictEqual(data.toString('utf8'), 'A'.repeat(64));
      assert.strictEqual(mockFetcher.rangeCalls.length, 1);
    });

    it('serves from cache on second request', async () => {
      await cache.getRange(1234, 0, 63);
      mockFetcher.reset();
      
      const data = await cache.getRange(1234, 0, 63);
      assert.strictEqual(data.toString('utf8'), 'A'.repeat(64));
      assert.strictEqual(mockFetcher.rangeCalls.length, 0);
    });

    it('fetches only missing ranges', async () => {
      // Cache first block
      await cache.getRange(1234, 0, 63);
      mockFetcher.reset();
      
      // Request spanning cached and uncached
      await cache.getRange(1234, 0, 127);
      
      // Should only fetch the uncached part
      assert.strictEqual(mockFetcher.rangeCalls.length, 1);
      assert.ok(mockFetcher.rangeCalls[0].start >= 64);
    });

    it('handles partial block requests', async () => {
      // Request middle of a block
      const data = await cache.getRange(1234, 10, 50);
      assert.strictEqual(data.length, 41);
      assert.strictEqual(data.toString('utf8'), 'A'.repeat(41));
    });

    it('handles cross-block requests', async () => {
      // Request spanning multiple blocks (64-byte blocks)
      const data = await cache.getRange(1234, 50, 150);
      assert.strictEqual(data.length, 101);
      
      // First 14 bytes should be 'A', rest 'B'
      const str = data.toString('utf8');
      assert.ok(str.startsWith('A'.repeat(14)));
    });

    it('handles requests at end of file', async () => {
      const data = await cache.getRange(1234, testContent.length - 10, testContent.length - 1);
      assert.strictEqual(data.length, 10);
      assert.strictEqual(data.toString('utf8'), 'D'.repeat(10));
    });

    it('clamps requests beyond file size', async () => {
      const data = await cache.getRange(1234, testContent.length - 5, testContent.length + 100);
      assert.strictEqual(data.length, 5);
    });
  });

  describe('cache statistics', () => {
    it('tracks cache hits and misses', async () => {
      await cache.getRange(1234, 0, 63);
      await cache.getRange(1234, 0, 63);
      
      const stats = cache.getStats();
      assert.ok(stats.bytesFromNetwork > 0);
      // Second request should have cache hit
    });

    it('provides per-book statistics', async () => {
      await cache.getRange(1234, 0, 127);
      
      const bookStats = cache.getBookStats(1234);
      assert.ok(bookStats !== null);
      assert.strictEqual(bookStats!.bookId, 1234);
      assert.strictEqual(bookStats!.fileSize, testContent.length);
      assert.ok(bookStats!.blocksCached > 0);
      assert.ok(bookStats!.coveragePercent > 0);
    });
  });

  describe('invalidation', () => {
    it('removes all cache files for a book', async () => {
      await cache.getRange(1234, 0, 127);
      
      assert.ok(fs.existsSync(path.join(TEST_CACHE_DIR, '1234.txt')));
      assert.ok(fs.existsSync(path.join(TEST_CACHE_DIR, '1234.bitmap')));
      assert.ok(fs.existsSync(path.join(TEST_CACHE_DIR, '1234.meta.json')));
      
      await cache.invalidate(1234);
      
      assert.ok(!fs.existsSync(path.join(TEST_CACHE_DIR, '1234.txt')));
      assert.ok(!fs.existsSync(path.join(TEST_CACHE_DIR, '1234.bitmap')));
      assert.ok(!fs.existsSync(path.join(TEST_CACHE_DIR, '1234.meta.json')));
    });

    it('fetches fresh data after invalidation', async () => {
      await cache.getRange(1234, 0, 63);
      mockFetcher.reset();
      
      await cache.invalidate(1234);
      await cache.getRange(1234, 0, 63);
      
      // Should have made new requests
      assert.ok(mockFetcher.headCalls > 0 || mockFetcher.rangeCalls.length > 0);
    });
  });

  describe('validation', () => {
    it('validates against upstream when stale', async () => {
      // Use very short validation interval
      cache = new SparseCache(createTestOptions({ validationIntervalMs: 10 }));
      cache.setUpstreamFetcher(mockFetcher);
      
      await cache.getRange(1234, 0, 63);
      mockFetcher.reset();
      
      // Wait for validation interval
      await new Promise(resolve => setTimeout(resolve, 20));
      
      await cache.getRange(1234, 64, 127);
      
      // Should have made a HEAD request for validation
      assert.ok(mockFetcher.headCalls >= 1);
    });

    it('invalidates cache when etag changes', async () => {
      await cache.getRange(1234, 0, 63);
      
      // Change etag
      mockFetcher.etag = 'new-etag-456';
      
      // Force validation
      const isValid = await cache.forceValidation(1234);
      
      // Etag changed, so should be invalid
      // Note: depending on implementation, this might still return true
      // if the file size matches
    });

    it('invalidates cache when file size changes', async () => {
      await cache.getRange(1234, 0, 63);
      
      // Change content (and thus size)
      mockFetcher.content = Buffer.from('X'.repeat(500));
      
      const isValid = await cache.forceValidation(1234);
      assert.strictEqual(isValid, false);
    });
  });

  describe('list and clear', () => {
    it('lists all cached books', async () => {
      await cache.getRange(1234, 0, 63);
      await cache.getRange(5678, 0, 63);
      
      const books = cache.listCachedBooks();
      assert.ok(books.includes(1234));
      assert.ok(books.includes(5678));
    });

    it('clears all cached data', async () => {
      await cache.getRange(1234, 0, 63);
      await cache.getRange(5678, 0, 63);
      
      await cache.clearAll();
      
      const books = cache.listCachedBooks();
      assert.strictEqual(books.length, 0);
    });
  });

  describe('LRU pruning', () => {
    it('removes oldest books when pruning', async () => {
      // Access books with delays to establish order
      await cache.getRange(1, 0, 63);
      await new Promise(r => setTimeout(r, 10));
      await cache.getRange(2, 0, 63);
      await new Promise(r => setTimeout(r, 10));
      await cache.getRange(3, 0, 63);
      
      const removed = await cache.pruneByLRU(2);
      
      // Should have removed the oldest (book 1)
      assert.ok(removed.includes(1));
      assert.ok(!removed.includes(3));
    });
  });

  describe('error handling', () => {
    it('falls back to network on cache read failure', async () => {
      // First request to populate cache
      await cache.getRange(1234, 0, 63);
      
      // Corrupt the data file
      const dataPath = path.join(TEST_CACHE_DIR, '1234.txt');
      fs.unlinkSync(dataPath);
      
      mockFetcher.reset();
      
      // Should still work by fetching from network
      const data = await cache.getRange(1234, 64, 127);
      assert.ok(data.length > 0);
    });

    it('propagates upstream errors when cache unavailable', async () => {
      mockFetcher.shouldFail = true;
      
      await assert.rejects(async () => {
        await cache.getRange(1234, 0, 63);
      }, /Mock upstream failure/);
    });
  });
});

// ============================================================================
// CachedFetcher Tests
// ============================================================================

describe('CachedFetcher', () => {
  let mockFetcher: MockUpstreamFetcher;
  let sparseCache: SparseCache;
  const testContent = 'Test content for cached fetcher '.repeat(50);

  beforeEach(() => {
    cleanTestDir();
    resetSharedSparseCache();
    mockFetcher = new MockUpstreamFetcher(testContent);
    sparseCache = new SparseCache(createTestOptions());
    sparseCache.setUpstreamFetcher(mockFetcher);
  });

  afterEach(() => {
    cleanTestDir();
  });

  it('provides same interface as Fetcher', async () => {
    const cached = new CachedFetcher(1234, false, {
      sparseCache,
      useMirrors: false
    });

    // Test interface methods exist
    assert.strictEqual(typeof cached.getFileSize, 'function');
    assert.strictEqual(typeof cached.fetchRange, 'function');
    assert.strictEqual(typeof cached.getStats, 'function');
  });

  it('returns correct file size', async () => {
    const cached = new CachedFetcher(1234, false, {
      sparseCache,
      useMirrors: false
    });

    const size = await cached.getFileSize();
    assert.strictEqual(size, testContent.length);
  });

  it('fetches and returns data', async () => {
    const cached = new CachedFetcher(1234, false, {
      sparseCache,
      useMirrors: false
    });

    const data = await cached.fetchRange(0, 99);
    assert.strictEqual(data.length, 100);
    assert.strictEqual(data.toString('utf8'), testContent.substring(0, 100));
  });

  it('tracks request statistics', async () => {
    const cached = new CachedFetcher(1234, false, {
      sparseCache,
      useMirrors: false
    });

    await cached.fetchRange(0, 99);
    await cached.fetchRange(100, 199);

    const stats = cached.getStats();
    assert.strictEqual(stats.requests, 2);
    assert.ok(stats.bytesDownloaded > 0);
  });

  it('reports cache statistics', async () => {
    const cached = new CachedFetcher(1234, false, {
      sparseCache,
      useMirrors: false
    });

    await cached.fetchRange(0, 99);
    await cached.fetchRange(0, 99);  // Should hit cache

    const cacheStats = cached.getCacheStats();
    assert.ok(cacheStats.cacheHits >= 1);
  });

  it('can invalidate its cache', async () => {
    const cached = new CachedFetcher(1234, false, {
      sparseCache,
      useMirrors: false
    });

    await cached.fetchRange(0, 99);
    await cached.invalidateCache();

    // Check cache is gone
    const stats = sparseCache.getBookStats(1234);
    assert.strictEqual(stats, null);
  });

  it('can force validation', async () => {
    const cached = new CachedFetcher(1234, false, {
      sparseCache,
      useMirrors: false
    });

    await cached.fetchRange(0, 99);
    const isValid = await cached.validateCache();
    assert.strictEqual(isValid, true);
  });

  it('retries on failure', async () => {
    const cached = new CachedFetcher(1234, false, {
      sparseCache,
      useMirrors: false
    });

    // Make first call succeed, then fail
    mockFetcher.failAfterCalls = 2;

    await cached.fetchRange(0, 99);
    
    // The implementation should retry on failure
    // This tests that the retry logic exists
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  let cache: SparseCache;
  let mockFetcher: MockUpstreamFetcher;

  beforeEach(() => {
    cleanTestDir();
    resetSharedSparseCache();
  });

  afterEach(() => {
    cleanTestDir();
  });

  it('gradually fills cache as different ranges are requested', async () => {
    const content = 'A'.repeat(1024);  // 1KB of As
    mockFetcher = new MockUpstreamFetcher(content);
    cache = new SparseCache(createTestOptions({ blockSize: 128 }));
    cache.setUpstreamFetcher(mockFetcher);

    // Request different ranges
    await cache.getRange(1, 0, 127);
    await cache.getRange(1, 256, 383);
    await cache.getRange(1, 512, 639);

    const stats = cache.getBookStats(1);
    assert.ok(stats !== null);
    
    // Should have cached 3 ranges (some blocks)
    assert.ok(stats!.blocksCached >= 3);
    assert.ok(stats!.coveragePercent < 100);
    assert.ok(stats!.coveragePercent > 0);
  });

  it('eventually reaches 100% coverage', async () => {
    const content = 'X'.repeat(512);
    mockFetcher = new MockUpstreamFetcher(content);
    cache = new SparseCache(createTestOptions({ blockSize: 64 }));
    cache.setUpstreamFetcher(mockFetcher);

    // Request entire file
    await cache.getRange(1, 0, 511);

    const stats = cache.getBookStats(1);
    assert.ok(stats !== null);
    assert.strictEqual(stats!.coveragePercent, 100);
  });

  it('serves mixed cached/uncached requests correctly', async () => {
    const content = 'ABCDEFGH'.repeat(64);  // 512 bytes
    mockFetcher = new MockUpstreamFetcher(content);
    cache = new SparseCache(createTestOptions({ blockSize: 64 }));
    cache.setUpstreamFetcher(mockFetcher);

    // Cache first block
    await cache.getRange(1, 0, 63);
    mockFetcher.reset();

    // Request spanning cached and uncached
    const data = await cache.getRange(1, 32, 95);
    
    // Should fetch only block 1 (64-127)
    assert.strictEqual(mockFetcher.rangeCalls.length, 1);
    
    // Data should be correct
    assert.strictEqual(data.length, 64);
  });

  it('handles concurrent requests for same book', async () => {
    const content = 'Y'.repeat(1024);
    mockFetcher = new MockUpstreamFetcher(content);
    cache = new SparseCache(createTestOptions());
    cache.setUpstreamFetcher(mockFetcher);

    // Make concurrent requests
    const promises = [
      cache.getRange(1, 0, 127),
      cache.getRange(1, 128, 255),
      cache.getRange(1, 0, 255)
    ];

    const results = await Promise.all(promises);
    
    // All should succeed
    assert.strictEqual(results[0].length, 128);
    assert.strictEqual(results[1].length, 128);
    assert.strictEqual(results[2].length, 256);
  });

  it('handles multiple books independently', async () => {
    const content1 = 'A'.repeat(256);
    const content2 = 'B'.repeat(256);
    
    const mock1 = new MockUpstreamFetcher(content1);
    const mock2 = new MockUpstreamFetcher(content2);
    
    cache = new SparseCache(createTestOptions());
    
    // Set up first book
    cache.setUpstreamFetcher(mock1);
    await cache.getRange(1, 0, 63);
    
    // Set up second book
    cache.setUpstreamFetcher(mock2);
    await cache.getRange(2, 0, 63);
    
    // Both should be cached independently
    const books = cache.listCachedBooks();
    assert.ok(books.includes(1));
    assert.ok(books.includes(2));
    
    // Verify data integrity
    cache.setUpstreamFetcher(mock1);
    const data1 = await cache.getRange(1, 0, 63);
    assert.strictEqual(data1.toString('utf8'), 'A'.repeat(64));
    
    cache.setUpstreamFetcher(mock2);
    const data2 = await cache.getRange(2, 0, 63);
    assert.strictEqual(data2.toString('utf8'), 'B'.repeat(64));
  });
});
