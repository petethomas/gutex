/**
 * Sparse File Cache for Project Gutenberg Texts
 * 
 * Implements a local caching layer that:
 * - Pre-allocates files to exact remote size (sparse files)
 * - Tracks cached byte ranges via bitmap (block granularity)
 * - Coalesces missing ranges to minimize HTTP requests
 * - Validates against upstream ETags/Last-Modified periodically
 * - Gracefully degrades to network on cache failures
 * 
 * Design inspired by functional programming principles:
 * - Immutable metadata updates (copy-on-write semantics)
 * - Pure functions for range calculations
 * - Explicit error handling without exceptions where practical
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import type { Mirror } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Types
// ============================================================================

/** Result type for operations that can fail gracefully */
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Cache metadata stored alongside each book's data */
export interface CacheMetadata {
  bookId: number;
  fileSize: number;
  etag: string | null;
  lastModified: string | null;
  lastValidated: number;  // Unix timestamp ms
  lastAccessed: number;   // Unix timestamp ms
  createdAt: number;      // Unix timestamp ms
  blocksCached: number;   // Count of cached blocks
  totalBlocks: number;    // Total blocks in file
}

/** Statistics for cache inspection */
export interface CacheStats {
  bookId: number;
  fileSize: number;
  cachedBytes: number;
  totalBytes: number;
  coveragePercent: number;
  blocksCached: number;
  totalBlocks: number;
  lastValidated: Date;
  lastAccessed: Date;
  isStale: boolean;
  etag: string | null;
}

/** A contiguous range of bytes */
interface ByteRange {
  start: number;
  end: number;  // Inclusive
}

/** Configuration options */
export interface SparseCacheOptions {
  cacheDir?: string;
  blockSize?: number;           // Granularity for tracking (default 4KB)
  validationIntervalMs?: number; // How often to check upstream (default 24h)
  maxCoalesceGap?: number;      // Max gap to coalesce in bytes (default 8KB)
  debug?: boolean;
  baseUrl?: string;             // Override PG URL for testing
}

/** Upstream fetcher interface for dependency injection */
export interface UpstreamFetcher {
  head(bookId: number): Promise<{ size: number; etag: string | null; lastModified: string | null }>;
  getRange(bookId: number, start: number, end: number): Promise<Buffer>;
}

// ============================================================================
// Pure Functions for Bitmap Operations
// ============================================================================

/**
 * Calculate block index from byte offset
 */
function byteToBlock(byteOffset: number, blockSize: number): number {
  return Math.floor(byteOffset / blockSize);
}

/**
 * Calculate byte offset from block index
 */
function blockToByte(blockIndex: number, blockSize: number): number {
  return blockIndex * blockSize;
}

/**
 * Get required bitmap size in bytes for given file size
 */
function bitmapSize(fileSize: number, blockSize: number): number {
  const totalBlocks = Math.ceil(fileSize / blockSize);
  return Math.ceil(totalBlocks / 8);
}

/**
 * Check if a specific block is marked as cached
 */
function isBlockCached(bitmap: Buffer, blockIndex: number): boolean {
  const byteIndex = Math.floor(blockIndex / 8);
  const bitIndex = blockIndex % 8;
  if (byteIndex >= bitmap.length) return false;
  return (bitmap[byteIndex] & (1 << bitIndex)) !== 0;
}

/**
 * Mark a block as cached (returns new buffer - immutable semantics)
 */
function markBlockCached(bitmap: Buffer, blockIndex: number): Buffer {
  const result = Buffer.from(bitmap);
  const byteIndex = Math.floor(blockIndex / 8);
  const bitIndex = blockIndex % 8;
  if (byteIndex < result.length) {
    result[byteIndex] |= (1 << bitIndex);
  }
  return result;
}

/**
 * Mark a range of blocks as cached
 */
function markBlockRangeCached(bitmap: Buffer, startBlock: number, endBlock: number): Buffer {
  const result = Buffer.from(bitmap);
  for (let block = startBlock; block <= endBlock; block++) {
    const byteIndex = Math.floor(block / 8);
    const bitIndex = block % 8;
    if (byteIndex < result.length) {
      result[byteIndex] |= (1 << bitIndex);
    }
  }
  return result;
}

/**
 * Count total cached blocks in bitmap
 */
function countCachedBlocks(bitmap: Buffer): number {
  let count = 0;
  for (let i = 0; i < bitmap.length; i++) {
    let byte = bitmap[i];
    while (byte) {
      count += byte & 1;
      byte >>= 1;
    }
  }
  return count;
}

/**
 * Find uncached block ranges within a byte range
 * Returns array of block ranges that need fetching
 */
function findUncachedBlockRanges(
  bitmap: Buffer,
  startByte: number,
  endByte: number,
  blockSize: number,
  maxCoalesceGap: number
): ByteRange[] {
  const startBlock = byteToBlock(startByte, blockSize);
  const endBlock = byteToBlock(endByte, blockSize);
  const maxGapBlocks = Math.ceil(maxCoalesceGap / blockSize);
  
  const ranges: ByteRange[] = [];
  let rangeStart: number | null = null;
  let lastUncached: number | null = null;
  
  for (let block = startBlock; block <= endBlock; block++) {
    if (!isBlockCached(bitmap, block)) {
      if (rangeStart === null) {
        rangeStart = block;
      }
      lastUncached = block;
    } else if (rangeStart !== null) {
      // We hit a cached block - check if we should coalesce
      if (lastUncached !== null && (block - lastUncached) <= maxGapBlocks) {
        // Keep going, we'll coalesce over this gap
        continue;
      }
      // End current range - lastUncached is guaranteed non-null when rangeStart is non-null
      if (lastUncached !== null) {
        ranges.push({
          start: blockToByte(rangeStart, blockSize),
          end: blockToByte(lastUncached + 1, blockSize) - 1
        });
      }
      rangeStart = null;
      lastUncached = null;
    }
  }
  
  // Close final range
  if (rangeStart !== null) {
    const finalBlock = lastUncached !== null ? lastUncached : rangeStart;
    ranges.push({
      start: blockToByte(rangeStart, blockSize),
      end: blockToByte(finalBlock + 1, blockSize) - 1
    });
  }
  
  return ranges;
}

/**
 * Coalesce adjacent/overlapping ranges
 */
function coalesceRanges(ranges: ByteRange[], maxGap: number): ByteRange[] {
  if (ranges.length === 0) return [];
  
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const result: ByteRange[] = [{ ...sorted[0] }];
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];
    
    if (current.start <= last.end + maxGap + 1) {
      // Coalesce
      last.end = Math.max(last.end, current.end);
    } else {
      result.push({ ...current });
    }
  }
  
  return result;
}

// ============================================================================
// Default HTTP Fetcher
// ============================================================================

class HttpUpstreamFetcher implements UpstreamFetcher {
  private baseUrl: string;
  private timeout: number;
  private maxRedirects: number;
  private debug: boolean;

  constructor(baseUrl = 'https://www.gutenberg.org', debug = false) {
    this.baseUrl = baseUrl;
    this.timeout = 10000;
    this.maxRedirects = 5;
    this.debug = debug;
  }

  private log(msg: string): void {
    if (this.debug) console.error(`[HttpUpstream] ${msg}`);
  }

  private buildUrl(bookId: number): string {
    return `${this.baseUrl}/cache/epub/${bookId}/pg${bookId}.txt`;
  }

  async head(bookId: number): Promise<{ size: number; etag: string | null; lastModified: string | null }> {
    const url = this.buildUrl(bookId);
    this.log(`HEAD ${url}`);
    
    return this._headWithRedirects(url, 0);
  }

  private _headWithRedirects(
    url: string,
    redirectCount: number
  ): Promise<{ size: number; etag: string | null; lastModified: string | null }> {
    return new Promise((resolve, reject) => {
      if (redirectCount > this.maxRedirects) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.request(url, { method: 'HEAD', timeout: this.timeout }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const newUrl = new URL(res.headers.location, url).toString();
          this._headWithRedirects(newUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const size = parseInt(res.headers['content-length'] || '0', 10);
        const etag = (res.headers['etag'] as string) || null;
        const lastModified = (res.headers['last-modified'] as string) || null;

        resolve({ size, etag, lastModified });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    });
  }

  async getRange(bookId: number, start: number, end: number): Promise<Buffer> {
    const url = this.buildUrl(bookId);
    this.log(`GET ${url} [${start}-${end}]`);
    
    return this._getWithRedirects(url, start, end, 0);
  }

  private _getWithRedirects(
    url: string,
    start: number,
    end: number,
    redirectCount: number
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (redirectCount > this.maxRedirects) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = url.startsWith('https') ? https : http;
      const options = {
        headers: { 'Range': `bytes=${start}-${end}` },
        timeout: this.timeout
      };

      const req = protocol.get(url, options, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const newUrl = new URL(res.headers.location, url).toString();
          this._getWithRedirects(newUrl, start, end, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }
}

// ============================================================================
// Sparse Cache Implementation
// ============================================================================

export class SparseCache {
  private cacheDir: string;
  private blockSize: number;
  private validationIntervalMs: number;
  private maxCoalesceGap: number;
  private debug: boolean;
  private upstream: UpstreamFetcher;

  // In-memory metadata cache for quick access
  private metadataCache = new Map<number, CacheMetadata>();
  
  // In-memory bitmap cache
  private bitmapCache = new Map<number, Buffer>();
  
  // Pending fetches to avoid duplicate requests
  private pendingFetches = new Map<string, Promise<Buffer>>();

  // Stats tracking
  public stats = {
    cacheHits: 0,
    cacheMisses: 0,
    bytesFromCache: 0,
    bytesFromNetwork: 0,
    validationChecks: 0,
    validationRefreshes: 0
  };

  constructor(options: SparseCacheOptions = {}) {
    // Use cwd-relative path so cache is in project root, not dist/
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'sparse');
    this.blockSize = options.blockSize || 4096;
    this.validationIntervalMs = options.validationIntervalMs || 24 * 60 * 60 * 1000; // 24 hours
    this.maxCoalesceGap = options.maxCoalesceGap || 8192; // 8KB
    this.debug = options.debug || false;
    this.upstream = new HttpUpstreamFetcher(options.baseUrl, this.debug);
    
    this._ensureCacheDir();
  }

  private log(msg: string): void {
    if (this.debug) console.error(`[SparseCache] ${msg}`);
  }

  // ============================================================================
  // File Path Helpers
  // ============================================================================

  private dataPath(bookId: number): string {
    return path.join(this.cacheDir, `${bookId}.txt`);
  }

  private bitmapPath(bookId: number): string {
    return path.join(this.cacheDir, `${bookId}.bitmap`);
  }

  private metaPath(bookId: number): string {
    return path.join(this.cacheDir, `${bookId}.meta.json`);
  }

  private _ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  private loadMetadata(bookId: number): CacheMetadata | null {
    // Check memory cache first
    const cached = this.metadataCache.get(bookId);
    if (cached) return cached;

    // Try disk
    const metaFile = this.metaPath(bookId);
    if (!fs.existsSync(metaFile)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as CacheMetadata;
      this.metadataCache.set(bookId, data);
      return data;
    } catch (err) {
      this.log(`Failed to load metadata for ${bookId}: ${(err as Error).message}`);
      return null;
    }
  }

  private saveMetadata(meta: CacheMetadata): void {
    const metaFile = this.metaPath(meta.bookId);
    try {
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
      this.metadataCache.set(meta.bookId, meta);
    } catch (err) {
      this.log(`Failed to save metadata for ${meta.bookId}: ${(err as Error).message}`);
    }
  }

  // ============================================================================
  // Bitmap Operations
  // ============================================================================

  private loadBitmap(bookId: number, fileSize: number): Buffer {
    // Check memory cache
    const cached = this.bitmapCache.get(bookId);
    if (cached) return cached;

    const bitmapFile = this.bitmapPath(bookId);
    const size = bitmapSize(fileSize, this.blockSize);

    if (fs.existsSync(bitmapFile)) {
      try {
        const data = fs.readFileSync(bitmapFile);
        // Verify size matches expected
        if (data.length === size) {
          this.bitmapCache.set(bookId, data);
          return data;
        }
        this.log(`Bitmap size mismatch for ${bookId}, recreating`);
      } catch (err) {
        this.log(`Failed to load bitmap for ${bookId}: ${(err as Error).message}`);
      }
    }

    // Create new empty bitmap
    const bitmap = Buffer.alloc(size, 0);
    this.bitmapCache.set(bookId, bitmap);
    return bitmap;
  }

  private saveBitmap(bookId: number, bitmap: Buffer): void {
    const bitmapFile = this.bitmapPath(bookId);
    try {
      fs.writeFileSync(bitmapFile, bitmap);
      this.bitmapCache.set(bookId, bitmap);
    } catch (err) {
      this.log(`Failed to save bitmap for ${bookId}: ${(err as Error).message}`);
    }
  }

  // ============================================================================
  // Data File Operations
  // ============================================================================

  private ensureDataFile(bookId: number, size: number): boolean {
    const dataFile = this.dataPath(bookId);
    
    try {
      if (fs.existsSync(dataFile)) {
        const stat = fs.statSync(dataFile);
        if (stat.size === size) return true;
        // Size mismatch - recreate
        this.log(`Data file size mismatch for ${bookId}, recreating`);
        fs.unlinkSync(dataFile);
      }

      // Create sparse file with exact size
      const fd = fs.openSync(dataFile, 'w');
      fs.ftruncateSync(fd, size);
      fs.closeSync(fd);
      return true;
    } catch (err) {
      this.log(`Failed to ensure data file for ${bookId}: ${(err as Error).message}`);
      return false;
    }
  }

  private readDataRange(bookId: number, start: number, end: number): Buffer | null {
    const dataFile = this.dataPath(bookId);
    
    try {
      const fd = fs.openSync(dataFile, 'r');
      const length = end - start + 1;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      fs.closeSync(fd);
      return buffer;
    } catch (err) {
      this.log(`Failed to read data range for ${bookId}: ${(err as Error).message}`);
      return null;
    }
  }

  private writeDataRange(bookId: number, start: number, data: Buffer): boolean {
    const dataFile = this.dataPath(bookId);
    
    try {
      const fd = fs.openSync(dataFile, 'r+');
      fs.writeSync(fd, data, 0, data.length, start);
      fs.closeSync(fd);
      return true;
    } catch (err) {
      this.log(`Failed to write data range for ${bookId}: ${(err as Error).message}`);
      return false;
    }
  }

  // ============================================================================
  // Cache Initialization
  // ============================================================================

  /**
   * Initialize or validate cache for a book
   * Returns metadata if successful, null on failure
   */
  private async initializeBook(bookId: number): Promise<CacheMetadata | null> {
    const existingMeta = this.loadMetadata(bookId);
    
    if (existingMeta) {
      // Check if validation needed
      const needsValidation = Date.now() - existingMeta.lastValidated > this.validationIntervalMs;
      
      if (needsValidation) {
        const isValid = await this.validateBook(bookId, existingMeta);
        if (!isValid) {
          // Cache invalidated - reinitialize
          await this.invalidate(bookId);
          return this.initializeBook(bookId);
        }
      }
      
      return existingMeta;
    }

    // New book - fetch metadata from upstream
    try {
      const upstream = await this.upstream.head(bookId);
      
      const now = Date.now();
      const totalBlocks = Math.ceil(upstream.size / this.blockSize);
      
      const meta: CacheMetadata = {
        bookId,
        fileSize: upstream.size,
        etag: upstream.etag,
        lastModified: upstream.lastModified,
        lastValidated: now,
        lastAccessed: now,
        createdAt: now,
        blocksCached: 0,
        totalBlocks
      };

      // Create sparse data file
      if (!this.ensureDataFile(bookId, upstream.size)) {
        return null;
      }

      // Create empty bitmap
      const bitmap = Buffer.alloc(bitmapSize(upstream.size, this.blockSize), 0);
      this.saveBitmap(bookId, bitmap);
      this.saveMetadata(meta);

      return meta;
    } catch (err) {
      this.log(`Failed to initialize book ${bookId}: ${(err as Error).message}`);
      return null;
    }
  }

  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Validate cached content against upstream
   * Returns true if cache is still valid
   */
  private async validateBook(bookId: number, meta: CacheMetadata): Promise<boolean> {
    this.stats.validationChecks++;
    
    try {
      const upstream = await this.upstream.head(bookId);
      
      // Check if content has changed
      let hasChanged = false;
      
      if (upstream.size !== meta.fileSize) {
        hasChanged = true;
        this.log(`Book ${bookId} size changed: ${meta.fileSize} -> ${upstream.size}`);
      } else if (upstream.etag && meta.etag && upstream.etag !== meta.etag) {
        hasChanged = true;
        this.log(`Book ${bookId} etag changed`);
      } else if (upstream.lastModified && meta.lastModified && upstream.lastModified !== meta.lastModified) {
        hasChanged = true;
        this.log(`Book ${bookId} last-modified changed`);
      }

      if (hasChanged) {
        this.stats.validationRefreshes++;
        return false;
      }

      // Update validation timestamp
      const updatedMeta: CacheMetadata = {
        ...meta,
        lastValidated: Date.now(),
        etag: upstream.etag || meta.etag,
        lastModified: upstream.lastModified || meta.lastModified
      };
      this.saveMetadata(updatedMeta);
      
      return true;
    } catch (err) {
      this.log(`Validation failed for ${bookId}: ${(err as Error).message}`);
      // On validation failure, assume cache is still valid
      // This prevents network issues from destroying the cache
      return true;
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get file size for a book, initializing cache if needed
   */
  async getFileSize(bookId: number): Promise<number> {
    const meta = await this.initializeBook(bookId);
    if (!meta) {
      // Fall back to direct upstream
      const upstream = await this.upstream.head(bookId);
      return upstream.size;
    }
    return meta.fileSize;
  }

  /**
   * Get a byte range, reading from cache where available
   * and fetching missing ranges from upstream
   */
  async getRange(bookId: number, start: number, end: number): Promise<Buffer> {
    const meta = await this.initializeBook(bookId);
    
    if (!meta) {
      // Cache init failed - direct fetch
      this.stats.cacheMisses++;
      this.stats.bytesFromNetwork += (end - start + 1);
      return this.upstream.getRange(bookId, start, end);
    }

    // Clamp range to file bounds
    const clampedEnd = Math.min(end, meta.fileSize - 1);
    const clampedStart = Math.max(start, 0);
    
    if (clampedStart > clampedEnd) {
      return Buffer.alloc(0);
    }

    // Update access time
    const updatedMeta: CacheMetadata = { ...meta, lastAccessed: Date.now() };
    this.metadataCache.set(bookId, updatedMeta);

    // Load bitmap and find uncached ranges
    const bitmap = this.loadBitmap(bookId, meta.fileSize);
    const uncachedRanges = findUncachedBlockRanges(
      bitmap,
      clampedStart,
      clampedEnd,
      this.blockSize,
      this.maxCoalesceGap
    );

    if (uncachedRanges.length > 0) {
      // Fetch missing ranges
      const coalesced = coalesceRanges(uncachedRanges, this.maxCoalesceGap);
      await this.fetchAndStore(bookId, meta, bitmap, coalesced);
    }

    // Read entire range from cache
    const data = this.readDataRange(bookId, clampedStart, clampedEnd);
    if (data) {
      // Calculate cache vs network bytes
      let cachedBytes = (clampedEnd - clampedStart + 1);
      for (const range of uncachedRanges) {
        const overlap = Math.min(range.end, clampedEnd) - Math.max(range.start, clampedStart) + 1;
        if (overlap > 0) {
          cachedBytes -= overlap;
        }
      }
      
      if (cachedBytes > 0) {
        this.stats.cacheHits++;
        this.stats.bytesFromCache += cachedBytes;
      }
      
      return data;
    }

    // Cache read failed - direct fetch
    this.stats.cacheMisses++;
    this.stats.bytesFromNetwork += (clampedEnd - clampedStart + 1);
    return this.upstream.getRange(bookId, clampedStart, clampedEnd);
  }

  /**
   * Fetch ranges from upstream and store in cache
   */
  private async fetchAndStore(
    bookId: number,
    meta: CacheMetadata,
    bitmap: Buffer,
    ranges: ByteRange[]
  ): Promise<void> {
    let updatedBitmap = bitmap;
    let totalFetched = 0;

    for (const range of ranges) {
      // Clamp to file size
      const clampedEnd = Math.min(range.end, meta.fileSize - 1);
      
      // Create unique key for deduplication
      const fetchKey = `${bookId}:${range.start}:${clampedEnd}`;
      
      // Check if already fetching
      let fetchPromise = this.pendingFetches.get(fetchKey);
      
      if (!fetchPromise) {
        fetchPromise = this.upstream.getRange(bookId, range.start, clampedEnd);
        this.pendingFetches.set(fetchKey, fetchPromise);
        
        try {
          const data = await fetchPromise;
          
          // Write to cache file
          if (this.writeDataRange(bookId, range.start, data)) {
            // Update bitmap
            const startBlock = byteToBlock(range.start, this.blockSize);
            const endBlock = byteToBlock(clampedEnd, this.blockSize);
            updatedBitmap = markBlockRangeCached(updatedBitmap, startBlock, endBlock);
            totalFetched += data.length;
          }
        } finally {
          this.pendingFetches.delete(fetchKey);
        }
      } else {
        // Wait for existing fetch
        await fetchPromise;
      }
    }

    if (totalFetched > 0) {
      this.stats.bytesFromNetwork += totalFetched;
      
      // Save updated bitmap
      this.saveBitmap(bookId, updatedBitmap);
      
      // Update metadata
      const updatedMeta: CacheMetadata = {
        ...meta,
        blocksCached: countCachedBlocks(updatedBitmap),
        lastAccessed: Date.now()
      };
      this.saveMetadata(updatedMeta);
    }
  }

  /**
   * Invalidate cache for a book, removing all cached data
   */
  async invalidate(bookId: number): Promise<void> {
    this.log(`Invalidating cache for book ${bookId}`);
    
    // Clear memory caches
    this.metadataCache.delete(bookId);
    this.bitmapCache.delete(bookId);

    // Remove files
    const files = [this.dataPath(bookId), this.bitmapPath(bookId), this.metaPath(bookId)];
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (err) {
        this.log(`Failed to delete ${file}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Force validation check against upstream
   */
  async forceValidation(bookId: number): Promise<boolean> {
    const meta = this.loadMetadata(bookId);
    if (!meta) return false;
    
    return this.validateBook(bookId, meta);
  }

  /**
   * Get statistics for a cached book
   */
  getBookStats(bookId: number): CacheStats | null {
    const meta = this.loadMetadata(bookId);
    if (!meta) return null;

    const bitmap = this.loadBitmap(bookId, meta.fileSize);
    const cachedBlocks = countCachedBlocks(bitmap);
    const cachedBytes = cachedBlocks * this.blockSize;

    return {
      bookId: meta.bookId,
      fileSize: meta.fileSize,
      cachedBytes: Math.min(cachedBytes, meta.fileSize),
      totalBytes: meta.fileSize,
      coveragePercent: (cachedBlocks / meta.totalBlocks) * 100,
      blocksCached: cachedBlocks,
      totalBlocks: meta.totalBlocks,
      lastValidated: new Date(meta.lastValidated),
      lastAccessed: new Date(meta.lastAccessed),
      isStale: Date.now() - meta.lastValidated > this.validationIntervalMs,
      etag: meta.etag
    };
  }

  /**
   * Get aggregate cache statistics
   */
  getStats(): {
    cacheHits: number;
    cacheMisses: number;
    bytesFromCache: number;
    bytesFromNetwork: number;
    hitRate: number;
    validationChecks: number;
    validationRefreshes: number;
  } {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.cacheHits / total : 0
    };
  }

  /**
   * List all cached books
   */
  listCachedBooks(): number[] {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const bookIds = new Set<number>();
      
      for (const file of files) {
        const match = file.match(/^(\d+)\.(txt|bitmap|meta\.json)$/);
        if (match) {
          bookIds.add(parseInt(match[1], 10));
        }
      }
      
      return Array.from(bookIds).sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  /**
   * Clear all cached data
   */
  async clearAll(): Promise<void> {
    const books = this.listCachedBooks();
    for (const bookId of books) {
      await this.invalidate(bookId);
    }
    
    // Reset stats
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      bytesFromCache: 0,
      bytesFromNetwork: 0,
      validationChecks: 0,
      validationRefreshes: 0
    };
  }

  /**
   * Prune old cache entries by LRU
   */
  async pruneByLRU(maxBooks: number): Promise<number[]> {
    const books = this.listCachedBooks();
    if (books.length <= maxBooks) return [];

    // Load metadata for all books
    const withMeta = books
      .map(id => ({ id, meta: this.loadMetadata(id) }))
      .filter((x): x is { id: number; meta: CacheMetadata } => x.meta !== null)
      .sort((a, b) => a.meta.lastAccessed - b.meta.lastAccessed);

    // Remove oldest entries
    const toRemove = withMeta.slice(0, withMeta.length - maxBooks).map(x => x.id);
    
    for (const bookId of toRemove) {
      await this.invalidate(bookId);
    }

    return toRemove;
  }

  /**
   * Set a custom upstream fetcher (useful for testing or mirror integration)
   */
  setUpstreamFetcher(fetcher: UpstreamFetcher): void {
    this.upstream = fetcher;
  }
}

// ============================================================================
// Singleton for shared access
// ============================================================================

let sharedSparseCache: SparseCache | null = null;

export function getSharedSparseCache(options?: SparseCacheOptions): SparseCache {
  if (!sharedSparseCache) {
    sharedSparseCache = new SparseCache(options);
  }
  return sharedSparseCache;
}

export function resetSharedSparseCache(): void {
  sharedSparseCache = null;
}

// ============================================================================
// Exports for testing
// ============================================================================

export const _internal = {
  byteToBlock,
  blockToByte,
  bitmapSize,
  isBlockCached,
  markBlockCached,
  markBlockRangeCached,
  countCachedBlocks,
  findUncachedBlockRanges,
  coalesceRanges
};
