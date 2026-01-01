/**
 * MirrorManager handles Gutenberg mirrors for reliable content delivery.
 *
 * Strategy:
 * - At startup: download MIRRORS.ALL, fall back to local cache, fall back to direct
 * - On first request for a book: race top N mirrors in parallel, use fastest responder
 * - On subsequent requests: use the mirror that worked, with fast fallback
 * - Short timeouts (3s) to fail fast
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Mirror,
  MirrorStats,
  MirrorRequestResult,
  HttpResponse,
  HeadResult,
  GetResult,
  MirrorInitResult,
  GetOptions,
  MirrorStatus,
  LogCallback,
  MirrorManagerInterface
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface MirrorManagerOptions {
  requestTimeout?: number;
  raceCount?: number;
  debug?: boolean;
}

interface RequestOptions {
  method?: string;
  timeout?: number;
  headers?: Record<string, string>;
  _redirectCount?: number;
}

export class MirrorManager implements MirrorManagerInterface {
  private mirrorsUrl = 'https://www.gutenberg.org/MIRRORS.ALL';
  private localMirrorsPath = path.join(__dirname, '..', 'MIRRORS.ALL');
  public requestTimeout: number;
  public raceCount: number;
  private debug: boolean;

  // Parsed mirrors
  public mirrors: Mirror[] = [];

  // Default fallback
  private defaultMirror: Mirror = {
    baseUrl: 'https://www.gutenberg.org',
    provider: 'Project Gutenberg',
    location: 'Default',
    note: 'Primary site'
  };

  // Track mirror health
  public mirrorStats = new Map<string, MirrorStats>();

  // Track which mirror is working for each book
  public bookMirrors = new Map<number, Mirror>();

  public initialized = false;

  constructor(options: MirrorManagerOptions = {}) {
    this.requestTimeout = options.requestTimeout || 3000;
    this.raceCount = options.raceCount || 3;
    this.debug = options.debug || false;
  }

  private log(message: string): void {
    if (this.debug) {
      console.error(`[MirrorManager] ${message}`);
    }
  }

  /**
   * Initialize the mirror manager
   */
  async initialize(): Promise<MirrorInitResult> {
    if (this.initialized) {
      return {
        mirrorCount: this.mirrors.length,
        mirrors: this.mirrors.map(m => ({ provider: m.provider, location: m.location, baseUrl: m.baseUrl }))
      };
    }

    this.log('Initializing mirror manager...');

    let mirrorsContent: string | null = null;

    // Try to download fresh MIRRORS.ALL
    try {
      mirrorsContent = await this._downloadMirrorsFile();
      this.log('Downloaded fresh MIRRORS.ALL');

      try {
        fs.writeFileSync(this.localMirrorsPath, mirrorsContent, 'utf8');
        this.log('Saved MIRRORS.ALL to local cache');
      } catch (writeErr) {
        this.log(`Failed to cache MIRRORS.ALL locally: ${(writeErr as Error).message}`);
      }
    } catch (downloadErr) {
      this.log(`Failed to download MIRRORS.ALL: ${(downloadErr as Error).message}`);

      try {
        if (fs.existsSync(this.localMirrorsPath)) {
          mirrorsContent = fs.readFileSync(this.localMirrorsPath, 'utf8');
          this.log('Using local MIRRORS.ALL cache');
        }
      } catch (localErr) {
        this.log(`Failed to read local MIRRORS.ALL: ${(localErr as Error).message}`);
      }
    }

    if (mirrorsContent) {
      this.mirrors = this._parseMirrorsFile(mirrorsContent);
      this.log(`Parsed ${this.mirrors.length} usable HTTP/HTTPS mirrors`);
    }

    // Always have the default as an option
    if (!this.mirrors.some(m => m.baseUrl === this.defaultMirror.baseUrl)) {
      this.mirrors.push(this.defaultMirror);
    }

    this.initialized = true;

    return {
      mirrorCount: this.mirrors.length,
      mirrors: this.mirrors.map(m => ({ provider: m.provider, location: m.location, baseUrl: m.baseUrl }))
    };
  }

  /**
   * Download MIRRORS.ALL from Gutenberg
   */
  private _downloadMirrorsFile(): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(this.mirrorsUrl, { timeout: 5000 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk: Buffer) => data += chunk.toString());
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout downloading MIRRORS.ALL'));
      });
    });
  }

  /**
   * Parse MIRRORS.ALL content
   */
  public _parseMirrorsFile(content: string): Mirror[] {
    const mirrors: Mirror[] = [];
    const lines = content.split('\n');
    const seenUrls = new Set<string>();

    for (const line of lines) {
      if (line.includes('continent') || line.includes('---') || !line.trim()) {
        continue;
      }

      if (line.match(/^\(\d+ rows\)/)) {
        continue;
      }

      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 5) continue;

      const [continent, nation, location, provider, url, note] = parts;

      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        continue;
      }

      let baseUrl = url.trim().replace(/\/+$/, '');

      if (baseUrl.includes('/dirs')) {
        continue;
      }

      if (baseUrl.includes('gutenberg-epub')) {
        continue;
      }

      if (seenUrls.has(baseUrl)) {
        continue;
      }
      seenUrls.add(baseUrl);

      mirrors.push({
        baseUrl,
        provider: provider || 'Unknown',
        location: `${location || ''}, ${nation || ''}`.replace(/^, |, $/g, ''),
        note: note || '',
        continent: continent || ''
      });
    }

    // Sort mirrors
    mirrors.sort((a, b) => {
      const aHttps = a.baseUrl.startsWith('https://') ? 0 : 1;
      const bHttps = b.baseUrl.startsWith('https://') ? 0 : 1;
      if (aHttps !== bHttps) return aHttps - bHttps;

      const aSpeed = (a.note ?? '').toLowerCase().includes('high speed') ? 0 : 1;
      const bSpeed = (b.note ?? '').toLowerCase().includes('high speed') ? 0 : 1;
      return aSpeed - bSpeed;
    });

    return mirrors;
  }

  /**
   * Build the full URL for a book's text file
   */
  public _buildBookUrl(mirrorBaseUrl: string, bookId: number): string {
    const base = mirrorBaseUrl.replace(/\/+$/, '');
    return `${base}/cache/epub/${bookId}/pg${bookId}.txt`;
  }

  /**
   * Get ordered list of mirrors based on health stats
   */
  public _getOrderedMirrors(): Mirror[] {
    if (this.mirrorStats.size === 0) {
      return [...this.mirrors];
    }

    const now = Date.now();
    const recentWindow = 5 * 60 * 1000;

    return [...this.mirrors].sort((a, b) => {
      const statsA = this.mirrorStats.get(a.baseUrl);
      const statsB = this.mirrorStats.get(b.baseUrl);

      if (!statsA && !statsB) return 0;
      if (!statsA) return 1;
      if (!statsB) return -1;

      const aRecentFail = statsA.lastFailure !== null && (now - statsA.lastFailure < recentWindow);
      const bRecentFail = statsB.lastFailure !== null && (now - statsB.lastFailure < recentWindow);
      if (aRecentFail && !bRecentFail) return 1;
      if (!aRecentFail && bRecentFail) return -1;

      const aTime = statsA.avgResponseTime ?? Infinity;
      const bTime = statsB.avgResponseTime ?? Infinity;
      return aTime - bTime;
    });
  }

  /**
   * Update stats for a mirror
   */
  public _updateMirrorStats(baseUrl: string, success: boolean, responseTime: number): void {
    const stats = this.mirrorStats.get(baseUrl) || {
      successes: 0,
      failures: 0,
      avgResponseTime: null,
      lastSuccess: null,
      lastFailure: null
    };

    const now = Date.now();

    if (success) {
      stats.successes++;
      stats.lastSuccess = now;
      if (stats.avgResponseTime === null) {
        stats.avgResponseTime = responseTime;
      } else {
        stats.avgResponseTime = (stats.avgResponseTime * 0.9) + (responseTime * 0.1);
      }
    } else {
      stats.failures++;
      stats.lastFailure = now;
    }

    this.mirrorStats.set(baseUrl, stats);
  }

  /**
   * Make an HTTP/HTTPS request with timeout
   */
  private _makeRequest(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https://') ? https : http;
      const method = options.method || 'GET';
      const timeout = options.timeout || this.requestTimeout;

      const reqOptions = {
        method,
        timeout,
        headers: options.headers || {}
      };

      const req = protocol.request(url, reqOptions, (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectCount = (options._redirectCount || 0) + 1;
          if (redirectCount > 3) {
            reject(new Error('Too many redirects'));
            return;
          }
          const newUrl = new URL(res.headers.location, url).toString();
          this._makeRequest(newUrl, { ...options, _redirectCount: redirectCount })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (method === 'HEAD') {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            url
          });
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks),
            url
          });
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout after ${timeout}ms`));
      });

      req.end();
    });
  }

  /**
   * Race multiple mirrors in parallel
   */
  private async _raceMirrors<T>(
    bookId: number,
    makeRequestFn: (url: string, mirror: Mirror) => Promise<T>
  ): Promise<MirrorRequestResult<T>> {
    await this.initialize();

    const orderedMirrors = this._getOrderedMirrors();
    const mirrorsToTry = orderedMirrors.slice(0, this.raceCount);

    const racePromises = mirrorsToTry.map(async (mirror): Promise<MirrorRequestResult<T>> => {
      const url = this._buildBookUrl(mirror.baseUrl, bookId);
      const startTime = Date.now();

      try {
        this.log(`Racing: ${mirror.provider} - ${url}`);
        const result = await makeRequestFn(url, mirror);
        const elapsed = Date.now() - startTime;

        this._updateMirrorStats(mirror.baseUrl, true, elapsed);
        this.log(`Winner: ${mirror.provider} (${elapsed}ms)`);

        return { success: true, result, mirror, elapsed };
      } catch (err) {
        const elapsed = Date.now() - startTime;
        this._updateMirrorStats(mirror.baseUrl, false, elapsed);
        this.log(`Failed: ${mirror.provider} - ${(err as Error).message} (${elapsed}ms)`);
        return { success: false, error: err as Error, mirror };
      }
    });

    const results = await Promise.all(racePromises);
    const winner = results.find(r => r.success);

    if (winner) {
      this.bookMirrors.set(bookId, winner.mirror);
      return winner;
    }

    // All raced mirrors failed - try remaining
    const remainingMirrors = orderedMirrors.slice(this.raceCount);
    for (const mirror of remainingMirrors) {
      const url = this._buildBookUrl(mirror.baseUrl, bookId);
      const startTime = Date.now();

      try {
        this.log(`Fallback: ${mirror.provider} - ${url}`);
        const result = await makeRequestFn(url, mirror);
        const elapsed = Date.now() - startTime;

        this._updateMirrorStats(mirror.baseUrl, true, elapsed);
        this.bookMirrors.set(bookId, mirror);

        return { success: true, result, mirror, elapsed };
      } catch (err) {
        const elapsed = Date.now() - startTime;
        this._updateMirrorStats(mirror.baseUrl, false, elapsed);
        this.log(`Fallback failed: ${mirror.provider} - ${(err as Error).message}`);
      }
    }

    throw new Error(`All ${orderedMirrors.length} mirrors failed for book ${bookId}`);
  }

  /**
   * Perform a HEAD request to get file info
   */
  async headWithFallback(bookId: number, logCallback?: LogCallback | null): Promise<HeadResult> {
    await this.initialize();

    // Check for sticky mirror
    const stickyMirror = this.bookMirrors.get(bookId);
    if (stickyMirror) {
      const url = this._buildBookUrl(stickyMirror.baseUrl, bookId);
      const startTime = Date.now();

      try {
        const response = await this._makeRequest(url, { method: 'HEAD' });
        const elapsed = Date.now() - startTime;

        if (response.statusCode === 200 && response.headers['content-length']) {
          this._updateMirrorStats(stickyMirror.baseUrl, true, elapsed);
          if (logCallback) logCallback('mirror', `Using ${stickyMirror.provider} (cached)`);

          const contentLength = Array.isArray(response.headers['content-length'])
            ? response.headers['content-length'][0]
            : response.headers['content-length'];

          return {
            url: response.url || url,
            contentLength: parseInt(contentLength || '0', 10),
            mirror: stickyMirror
          };
        }
      } catch (err) {
        this.log(`Sticky mirror failed: ${stickyMirror.provider} - ${(err as Error).message}`);
        this.bookMirrors.delete(bookId);
      }
    }

    // Race mirrors
    if (logCallback) logCallback('mirror_try', `Racing ${this.raceCount} mirrors...`);

    const winner = await this._raceMirrors(bookId, async (url) => {
      const response = await this._makeRequest(url, { method: 'HEAD' });

      if (response.statusCode === 200 && response.headers['content-length']) {
        const contentLength = Array.isArray(response.headers['content-length'])
          ? response.headers['content-length'][0]
          : response.headers['content-length'];

        return {
          url: response.url || url,
          contentLength: parseInt(contentLength || '0', 10)
        };
      }
      throw new Error(`HTTP ${response.statusCode}`);
    });

    if (logCallback) logCallback('mirror_success', `Using ${winner.mirror.provider} (${winner.elapsed}ms)`);

    return {
      url: winner.result!.url,
      contentLength: winner.result!.contentLength,
      mirror: winner.mirror
    };
  }

  /**
   * Perform a GET request
   */
  async getWithFallback(bookId: number, options: GetOptions = {}, logCallback?: LogCallback | null): Promise<GetResult> {
    await this.initialize();

    const headers: Record<string, string> = {};
    if (options.range) {
      headers['Range'] = options.range;
    }

    const makeGetRequest = async (url: string): Promise<HttpResponse> => {
      const response = await this._makeRequest(url, { headers });
      if (response.statusCode === 200 || response.statusCode === 206) {
        return response;
      }
      throw new Error(`HTTP ${response.statusCode}`);
    };

    // Use sticky mirror with backup racing
    const stickyMirror = this.bookMirrors.get(bookId);
    if (stickyMirror) {
      const stickyUrl = this._buildBookUrl(stickyMirror.baseUrl, bookId);

      const backupMirrors = this._getOrderedMirrors()
        .filter(m => m.baseUrl !== stickyMirror.baseUrl)
        .slice(0, 2);

      const stickyPromise = (async (): Promise<{ response: HttpResponse; mirror: Mirror; source: string }> => {
        const startTime = Date.now();
        try {
          const response = await makeGetRequest(stickyUrl);
          const elapsed = Date.now() - startTime;
          this._updateMirrorStats(stickyMirror.baseUrl, true, elapsed);
          return { response, mirror: stickyMirror, source: 'sticky' };
        } catch (err) {
          const elapsed = Date.now() - startTime;
          this._updateMirrorStats(stickyMirror.baseUrl, false, elapsed);
          this.log(`Sticky mirror failed: ${stickyMirror.provider} - ${(err as Error).message}`);
          throw err;
        }
      })();

      const backupPromises = backupMirrors.map(async (mirror): Promise<{ response: HttpResponse; mirror: Mirror; source: string }> => {
        await this._sleep(500);

        const url = this._buildBookUrl(mirror.baseUrl, bookId);
        const startTime = Date.now();
        try {
          const response = await makeGetRequest(url);
          const elapsed = Date.now() - startTime;
          this._updateMirrorStats(mirror.baseUrl, true, elapsed);
          return { response, mirror, source: 'backup' };
        } catch (err) {
          const elapsed = Date.now() - startTime;
          this._updateMirrorStats(mirror.baseUrl, false, elapsed);
          throw err;
        }
      });

      // Attach no-op catch handlers to prevent unhandled rejections from losing promises
      const allPromises = [stickyPromise, ...backupPromises];
      allPromises.forEach(p => p.catch(() => {}));

      try {
        const winner = await Promise.any(allPromises);

        if (winner.source === 'backup') {
          this.log(`Backup mirror won: ${winner.mirror.provider}`);
          this.bookMirrors.set(bookId, winner.mirror);
        }

        return {
          body: winner.response.body!,
          url: winner.response.url || this._buildBookUrl(winner.mirror.baseUrl, bookId),
          mirror: winner.mirror
        };
      } catch {
        this.log(`All mirrors failed for GET, clearing sticky`);
        this.bookMirrors.delete(bookId);
      }
    }

    // Full race
    const winner = await this._raceMirrors(bookId, async (url) => {
      const response = await this._makeRequest(url, { headers });

      if (response.statusCode === 200 || response.statusCode === 206) {
        return {
          body: response.body!,
          url: response.url || url
        };
      }
      throw new Error(`HTTP ${response.statusCode}`);
    });

    return {
      body: winner.result!.body,
      url: winner.result!.url,
      mirror: winner.mirror
    };
  }

  /**
   * Get mirror status for debugging
   */
  getStatus(): MirrorStatus {
    return {
      initialized: this.initialized,
      mirrorCount: this.mirrors.length,
      stickyBooks: this.bookMirrors.size,
      mirrors: this.mirrors.map(m => {
        const stats = this.mirrorStats.get(m.baseUrl);
        return {
          provider: m.provider,
          location: m.location,
          baseUrl: m.baseUrl,
          stats: stats || { successes: 0, failures: 0, avgResponseTime: null, lastSuccess: null, lastFailure: null }
        };
      })
    };
  }

  /**
   * Clear cached mirror for a book
   */
  clearBookMirror(bookId: number): void {
    this.bookMirrors.delete(bookId);
  }

  public _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let sharedInstance: MirrorManager | null = null;

export function getSharedMirrorManager(options: MirrorManagerOptions = {}): MirrorManager {
  if (!sharedInstance) {
    sharedInstance = new MirrorManager(options);
  }
  return sharedInstance;
}

export function resetSharedMirrorManager(): void {
  sharedInstance = null;
}
