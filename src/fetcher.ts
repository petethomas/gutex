/**
 * Fetcher Module
 * Handles HTTP range requests for Gutenberg books with mirror support
 */

import https from 'https';
import { getSharedMirrorManager } from './mirror-manager.js';
import type { FetcherOptions, FetcherStats, Mirror, LogCallback, MirrorManagerInterface } from './types.js';

interface HttpRequestOptions {
  headers?: Record<string, string>;
}

export class Fetcher {
  public bookId: number;
  private baseUrl: string;
  private resolvedUrl: string | null = null;
  private totalBytes: number | null = null;
  private debug: boolean;
  public requestCount = 0;
  public totalBytesDownloaded = 0;
  private maxRedirects = 5;

  // Mirror support
  private useMirrors: boolean;
  private mirrorManager: MirrorManagerInterface | null;
  private currentMirror: Mirror | null = null;
  private logCallback: LogCallback | null;

  constructor(bookId: number, debug = false, options: FetcherOptions = {}) {
    this.bookId = bookId;
    this.baseUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
    this.debug = debug;
    this.useMirrors = options.useMirrors !== false;
    this.mirrorManager = options.mirrorManager || null;
    this.logCallback = options.logCallback || null;
  }

  private _log(message: string): void {
    if (this.debug) {
      console.error(`[Fetcher ${this.bookId}] ${message}`);
    }
  }

  async getFileSize(): Promise<number> {
    if (this.totalBytes !== null) return this.totalBytes;

    // Try mirrors first if enabled
    if (this.useMirrors) {
      try {
        const mm = this.mirrorManager || getSharedMirrorManager({ debug: this.debug });
        const result = await mm.headWithFallback(this.bookId, this.logCallback);

        this.resolvedUrl = result.url;
        this.totalBytes = result.contentLength;
        this.currentMirror = result.mirror;

        this._log(`Using mirror: ${result.mirror.provider} (${result.contentLength} bytes)`);

        return this.totalBytes;
      } catch (mirrorErr) {
        this._log(`Mirror fallback failed: ${(mirrorErr as Error).message}, trying direct...`);
      }
    }

    // Fallback to direct request
    return new Promise((resolve, reject) => {
      this._headWithRedirects(this.baseUrl, 0, (err, finalUrl, contentLength) => {
        if (err) {
          reject(err);
          return;
        }
        this.resolvedUrl = finalUrl!;
        this.totalBytes = contentLength!;
        this.currentMirror = { provider: 'gutenberg.org (direct)', baseUrl: 'https://www.gutenberg.org', location: 'Direct' };
        resolve(this.totalBytes);
      });
    });
  }

  private _headWithRedirects(
    url: string,
    redirectCount: number,
    callback: (err: Error | null, finalUrl?: string, contentLength?: number) => void
  ): void {
    if (redirectCount > this.maxRedirects) {
      callback(new Error(`Too many redirects for book ${this.bookId}`));
      return;
    }

    const req = https.request(url, { method: 'HEAD' }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = new URL(res.headers.location, url).toString();
        if (this.debug) {
          console.error(`[HTTP] Redirect ${res.statusCode}: ${url} -> ${newUrl}`);
        }
        this._headWithRedirects(newUrl, redirectCount + 1, callback);
        return;
      }

      if (res.statusCode === 200 && res.headers['content-length']) {
        callback(null, url, parseInt(res.headers['content-length'], 10));
      } else {
        callback(new Error(`Book ${this.bookId} not found or unavailable (HTTP ${res.statusCode})`));
      }
    });

    req.on('error', callback);
    req.setTimeout(10000, () => {
      req.destroy();
      callback(new Error('Request timeout'));
    });
    req.end();
  }

  async fetchRange(startByte: number, endByte: number, retries = 3): Promise<Buffer> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this._doFetch(startByte, endByte);
      } catch (err) {
        this._log(`Attempt ${attempt + 1} failed: ${(err as Error).message}`);
        if (attempt === retries - 1) throw err;
        await this._sleep(500 * (attempt + 1));
      }
    }
    throw new Error('Fetch failed after all retries');
  }

  private async _doFetch(startByte: number, endByte: number): Promise<Buffer> {
    this.requestCount++;
    const requestSize = endByte - startByte + 1;
    this.totalBytesDownloaded += requestSize;

    if (this.debug) {
      console.error(`[HTTP] Request #${this.requestCount}: bytes ${startByte}-${endByte} (${requestSize} bytes)`);
    }

    // Try mirrors if enabled
    if (this.useMirrors) {
      try {
        const mm = this.mirrorManager || getSharedMirrorManager({ debug: this.debug });
        const result = await mm.getWithFallback(
          this.bookId,
          { range: `bytes=${startByte}-${endByte}` },
          this.logCallback
        );

        this.currentMirror = result.mirror;
        this._log(`Range fetched from ${result.mirror.provider}: ${result.body.length} bytes`);

        return result.body;
      } catch (mirrorErr) {
        this._log(`Mirror range fetch failed: ${(mirrorErr as Error).message}, trying direct...`);
      }
    }

    // Fallback to direct request
    return new Promise((resolve, reject) => {
      const url = this.resolvedUrl || this.baseUrl;

      const options: HttpRequestOptions = {
        headers: {
          'Range': `bytes=${startByte}-${endByte}`
        }
      };

      this._getWithRedirects(url, options, 0, (err, buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(buffer!);
        }
      });
    });
  }

  private _getWithRedirects(
    url: string,
    options: HttpRequestOptions,
    redirectCount: number,
    callback: (err: Error | null, buffer?: Buffer) => void
  ): void {
    if (redirectCount > this.maxRedirects) {
      callback(new Error(`Too many redirects for book ${this.bookId}`));
      return;
    }

    https.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = new URL(res.headers.location, url).toString();
        if (this.debug) {
          console.error(`[HTTP] Redirect ${res.statusCode}: ${url} -> ${newUrl}`);
        }
        this._getWithRedirects(newUrl, options, redirectCount + 1, callback);
        return;
      }

      if (res.statusCode !== 206 && res.statusCode !== 200) {
        callback(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
      res.on('error', callback);
    }).on('error', callback);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): FetcherStats {
    return {
      requests: this.requestCount,
      bytesDownloaded: this.totalBytesDownloaded,
      totalBytes: this.totalBytes,
      efficiency: this.totalBytes ? ((this.totalBytesDownloaded / this.totalBytes) * 100).toFixed(2) + '%' : 'N/A',
      mirror: this.currentMirror ? this.currentMirror.provider : 'N/A'
    };
  }

  getCurrentMirror(): Mirror | null {
    return this.currentMirror;
  }
}
