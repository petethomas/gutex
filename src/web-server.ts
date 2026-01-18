/**
 * WebServer for Gutex
 * Reuses Navigator's chunk fetching logic.
 * Client maintains history for backward navigation.
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Fetcher } from './fetcher.js';
import { CachedFetcher } from './cached-fetcher.js';
import { SparseCache, getSharedSparseCache } from './sparse-cache.js';
import { Cleaner } from './cleaner.js';
import { Navigator } from './navigator.js';
import { CatalogManager } from './catalog-manager.js';
import { getSharedMirrorManager } from './mirror-manager.js';
import { P2PSignalingServer } from './p2p-signaling.js';
import { saveBookmark, loadBookmark, listBookmarks, deleteBookmark } from './bookmarks.js';
import { NetworkSearcher } from './network-search.js';
import { saveLastPosition, loadLastPosition, clearLastPosition } from './last-position.js';
import type {
  WebServerOptions,
  RequestLogEntry,
  EventLogEntry,
  ChunkResponse,
  CatalogRecord,
  BookmarkInfo
} from './types.js';
import type { LastPosition } from './last-position.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type NavigatorWithMeta = Navigator & {
  actualBookId?: number;
  requestedBookId?: number;
};

export class WebServer {
  private port: number;
  private chunkSize: number;
  private navigators = new Map<number, NavigatorWithMeta>();
  public catalog = new CatalogManager();
  private mirrorManager = getSharedMirrorManager({ debug: false });
  private p2pSignaling = new P2PSignalingServer();
  public requestLog: RequestLogEntry[] = [];
  public eventLog: EventLogEntry[] = [];
  public maxLogSize = 50;
  private debug: boolean;
  private useLocalCache: boolean;
  private sparseCache: SparseCache | null = null;

  constructor(options: WebServerOptions = {}) {
    this.port = options.port || 3000;
    this.chunkSize = options.chunkSize || 200;
    this.debug = options.debug || false;
    this.useLocalCache = options.useLocalCache !== false;  // Default to true
    
    if (this.debug) {
      this.mirrorManager = getSharedMirrorManager({ debug: true });
    }
    
    if (this.useLocalCache) {
      this.sparseCache = getSharedSparseCache({
        cacheDir: options.cacheDir,
        debug: this.debug
      });
    }
  }

  public logRequest(info: Omit<RequestLogEntry, 'timestamp'>): void {
    this.requestLog.unshift({
      ...info,
      timestamp: Date.now()
    });
    if (this.requestLog.length > this.maxLogSize) {
      this.requestLog.pop();
    }
  }

  public logEvent(type: string, message: string, durationMs: number | null = null, extra: Record<string, unknown> = {}): void {
    this.eventLog.unshift({
      type,
      message,
      duration: durationMs,
      timestamp: Date.now(),
      ...extra
    });
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.pop();
    }
  }

  private logError(context: string, err: Error): void {
    const stack = err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : '';
    this.logEvent('error', `${context}: ${err.message}`, null, {
      errorCode: (err as NodeJS.ErrnoException).code || null,
      stack: stack
    });
  }

  public async getNavigator(bookId: number): Promise<NavigatorWithMeta> {
    if (this.navigators.has(bookId)) {
      return this.navigators.get(bookId)!;
    }

    const mirrorLogCallback = (type: string, message: string): void => {
      this.logEvent(type, message);
    };

    // Create fetcher - use CachedFetcher if local caching is enabled
    let fetcher: Fetcher | CachedFetcher;
    if (this.useLocalCache && this.sparseCache) {
      fetcher = new CachedFetcher(bookId, this.debug, {
        mirrorManager: this.mirrorManager,
        logCallback: mirrorLogCallback,
        sparseCache: this.sparseCache
      });
    } else {
      fetcher = new Fetcher(bookId, this.debug, {
        mirrorManager: this.mirrorManager,
        logCallback: mirrorLogCallback
      });
    }
    let actualBookId = bookId;

    // Verify the book's text file exists
    try {
      await fetcher.getFileSize();

      const mirror = fetcher.getCurrentMirror();
      if (mirror) {
        this.logEvent('mirror', `Book ${bookId}: using ${mirror.provider}`);
      }
      if (this.useLocalCache) {
        this.logEvent('cache', `Book ${bookId}: local caching enabled`);
      }
    } catch (err) {
      // Book ID doesn't have a text file - try to find an alternative
      const book = this.catalog.getBookById(bookId);
      if (book?.title) {
        const alternative = await this._findAlternativeTextVersion(book.title, bookId);
        if (alternative) {
          actualBookId = alternative;
          if (this.useLocalCache && this.sparseCache) {
            fetcher = new CachedFetcher(actualBookId, this.debug, {
              mirrorManager: this.mirrorManager,
              logCallback: mirrorLogCallback,
              sparseCache: this.sparseCache
            });
          } else {
            fetcher = new Fetcher(actualBookId, this.debug, {
              mirrorManager: this.mirrorManager,
              logCallback: mirrorLogCallback
            });
          }
          await fetcher.getFileSize();
        } else {
          throw new Error(`No plain text available for "${book.title}". This book may only exist in HTML or other formats on Project Gutenberg.`);
        }
      } else {
        throw new Error(`Book ${bookId} not found or unavailable.`);
      }
    }

    // Wrap fetchRange to log requests with cache awareness
    const originalFetchRange = fetcher.fetchRange.bind(fetcher);
    const isCached = this.useLocalCache && fetcher instanceof CachedFetcher;
    
    fetcher.fetchRange = async (start: number, end: number): Promise<Buffer> => {
      const startTime = Date.now();
      const cacheStatsBefore = isCached ? (fetcher as CachedFetcher).getCacheStats() : null;
      
      const result = await originalFetchRange(start, end);
      
      const cacheStatsAfter = isCached ? (fetcher as CachedFetcher).getCacheStats() : null;
      const wasFromCache = cacheStatsAfter && cacheStatsBefore 
        ? cacheStatsAfter.cacheHits > cacheStatsBefore.cacheHits
        : false;
      
      const mirror = fetcher.getCurrentMirror();
      this.logRequest({
        type: 'range',
        bookId: actualBookId,
        start,
        end,
        bytes: end - start,
        duration: Date.now() - startTime,
        mirror: mirror ? mirror.provider : (isCached ? 'sparse-cache' : 'direct'),
        cached: wasFromCache
      });
      return result;
    };

    const boundaries = await Cleaner.findCleanBoundaries(fetcher);
    const navigator = new Navigator(fetcher, boundaries, this.chunkSize) as NavigatorWithMeta;

    // Store the actual book ID used
    navigator.actualBookId = actualBookId;
    navigator.requestedBookId = bookId;

    // Initialize calibration
    await navigator._calibrateWordDensity();

    // Cache under both the requested and actual book IDs
    this.navigators.set(bookId, navigator);
    if (actualBookId !== bookId) {
      this.navigators.set(actualBookId, navigator);
    }

    return navigator;
  }

  private async _findAlternativeTextVersion(title: string, excludeId: number): Promise<number | null> {
    const searchUrl = `https://gutendex.com/books/?search=${encodeURIComponent(title)}`;

    try {
      const results = await this._fetchJson(searchUrl) as { results?: Array<{ id: number; formats?: Record<string, string> }> };

      if (!results?.results?.length) return null;

      for (const book of results.results) {
        if (book.id === excludeId) continue;

        const hasText = book.formats && (
          book.formats['text/plain'] ||
          book.formats['text/plain; charset=utf-8'] ||
          book.formats['text/plain; charset=us-ascii']
        );

        if (hasText) {
          const testFetcher = new Fetcher(book.id, false);
          try {
            await testFetcher.getFileSize();
            return book.id;
          } catch {
            continue;
          }
        }
      }

      return null;
    } catch {
      return this._findAlternativeFromCatalog(title, excludeId);
    }
  }

  private async _findAlternativeFromCatalog(title: string, excludeId: number): Promise<number | null> {
    const searchTerms = title
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
      .slice(0, 3)
      .join(' ');

    if (!searchTerms) return null;

    const results = this.catalog.searchCatalog(searchTerms);

    for (const result of results) {
      if (result.id === String(excludeId)) continue;

      const testFetcher = new Fetcher(parseInt(result.id, 10), false);
      try {
        await testFetcher.getFileSize();
        return parseInt(result.id, 10);
      } catch {
        continue;
      }
    }

    return null;
  }

  private _fetchJson(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => data += chunk.toString());
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  private async handleApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts[0] !== 'api') {
      return false;
    }

    // GET /api/search?q=query&lang=en
    if (pathParts[1] === 'search') {
      const query = url.searchParams.get('q');
      const lang = url.searchParams.get('lang');
      const languageFilter = lang === 'all' ? null : (lang || null);
      
      if (!query || query.length < 2) {
        this.sendJson(res, 400, { error: 'Query too short' });
        return true;
      }

      try {
        const startTime = Date.now();
        const results = this.catalog.searchCatalog(query, languageFilter).slice(0, 50);
        this.logEvent('search', `query="${query}" lang=${lang || 'all'} results=${results.length}`, Date.now() - startTime);
        this.sendJson(res, 200, { query, results });
      } catch (err) {
        this.logEvent('error', `search failed: ${(err as Error).message}`);
        this.sendJson(res, 500, { error: (err as Error).message });
      }
      return true;
    }

    // GET /api/textsearch/:bookId?q=phrase&fuzzy=true
    // Network-efficient fulltext search within a book
    if (pathParts[1] === 'textsearch' && pathParts[2]) {
      const bookId = parseInt(pathParts[2], 10);
      const phrase = url.searchParams.get('q');
      const fuzzy = url.searchParams.get('fuzzy') === 'true';
      const maxResults = parseInt(url.searchParams.get('max') || '50', 10);
      
      if (isNaN(bookId)) {
        this.sendJson(res, 400, { error: 'Invalid book ID' });
        return true;
      }
      
      if (!phrase) {
        this.sendJson(res, 400, { error: 'Missing search phrase (q parameter)' });
        return true;
      }
      
      try {
        const searcher = new NetworkSearcher(this.debug);
        
        // Validate phrase (must be 4+ words)
        const validation = searcher.validatePhrase(phrase);
        if (!validation.valid) {
          this.sendJson(res, 400, { error: validation.error });
          return true;
        }
        
        // Build URL for the book
        const bookUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
        
        // Create cached range fetcher if SparseCache is available
        const rangeFetcher = this.sparseCache 
          ? (start: number, end: number) => this.sparseCache!.getRange(bookId, start, end)
          : undefined;
        
        const startTime = Date.now();
        const result = await searcher.search(bookUrl, phrase, {
          fuzzy,
          maxMatches: Math.min(maxResults, 100),
          maxEditDistance: fuzzy ? 2 : 0,
          contextSize: 150,
          debug: this.debug,
          rangeFetcher
        });
        
        this.logEvent('textsearch', 
          `book=${bookId} phrase="${phrase.slice(0, 30)}..." fuzzy=${fuzzy} ` +
          `matches=${result.matches.length} bytes=${result.bytesDownloaded} ` +
          `chunks=${result.chunksRequested} strategy=${result.strategy}`,
          Date.now() - startTime
        );
        
        this.sendJson(res, 200, {
          bookId,
          phrase,
          fuzzy,
          ...result
        });
      } catch (err) {
        this.logError(`textsearch book ${bookId}`, err as Error);
        this.sendJson(res, 500, { error: (err as Error).message });
      }
      return true;
    }

    // GET /api/random
    if (pathParts[1] === 'random') {
      const languageFilter = url.searchParams.get('lang') || 'en';
      const MAX_ATTEMPTS = 20;
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          const book = this.catalog.getRandomBook(languageFilter === 'all' ? null : languageFilter);
          if (!book) {
            this.sendJson(res, 500, { error: 'Catalog not available' });
            return true;
          }

          const testFetcher = new Fetcher(parseInt(book.id, 10), false, {
            mirrorManager: this.mirrorManager
          });

          try {
            await testFetcher.getFileSize();
            this.logEvent('random', `selected book ${book.id}: ${book.title} (attempt ${attempts}, lang=${languageFilter})`);
            this.sendJson(res, 200, book);
            return true;
          } catch {
            this.logEvent('random', `book ${book.id} has no text, retrying (attempt ${attempts})`);
            continue;
          }
        } catch (err) {
          this.logEvent('error', `random attempt ${attempts} failed: ${(err as Error).message}`);
          continue;
        }
      }

      this.logEvent('error', `random: could not find a book with text after ${MAX_ATTEMPTS} attempts`);
      this.sendJson(res, 500, { error: 'Could not find a book with plain text' });
      return true;
    }

    // GET /api/bookinfo/:id
    if (pathParts[1] === 'bookinfo') {
      const bookId = pathParts[2];
      if (!bookId) {
        this.sendJson(res, 400, { error: 'Missing book ID' });
        return true;
      }

      try {
        const book = this.catalog.getBookById(bookId);
        if (book) {
          this.logEvent('bookinfo', `book ${bookId}: ${book.title}`);
          this.sendJson(res, 200, {
            id: book.id,
            title: book.title,
            author: book.author
          });
        } else {
          this.sendJson(res, 200, {
            id: bookId,
            title: null,
            author: null
          });
        }
      } catch {
        this.sendJson(res, 200, { id: bookId, title: null, author: null });
      }
      return true;
    }

    // GET /api/debug
    if (pathParts[1] === 'debug') {
      this.sendJson(res, 200, { requests: this.requestLog, events: this.eventLog });
      return true;
    }

    // GET /api/mirrors
    if (pathParts[1] === 'mirrors') {
      const status = this.mirrorManager.getStatus();
      this.sendJson(res, 200, status);
      return true;
    }

    // GET /api/cache - Get cache status
    if (pathParts[1] === 'cache' && !pathParts[2]) {
      if (!this.sparseCache) {
        this.sendJson(res, 200, { enabled: false });
        return true;
      }
      
      const stats = this.sparseCache.getStats();
      const books = this.sparseCache.listCachedBooks();
      
      this.sendJson(res, 200, {
        enabled: true,
        stats,
        cachedBooks: books.length,
        books
      });
      return true;
    }

    // GET /api/cache/:bookId - Get cache status for specific book
    if (pathParts[1] === 'cache' && pathParts[2] && req.method === 'GET') {
      const cacheBookId = parseInt(pathParts[2], 10);
      if (isNaN(cacheBookId)) {
        this.sendJson(res, 400, { error: 'Invalid book ID' });
        return true;
      }
      
      if (!this.sparseCache) {
        this.sendJson(res, 200, { enabled: false, bookId: cacheBookId });
        return true;
      }
      
      const bookStats = this.sparseCache.getBookStats(cacheBookId);
      if (!bookStats) {
        this.sendJson(res, 200, { 
          enabled: true, 
          bookId: cacheBookId, 
          cached: false 
        });
        return true;
      }
      
      this.sendJson(res, 200, {
        enabled: true,
        cached: true,
        ...bookStats
      });
      return true;
    }

    // DELETE /api/cache/:bookId - Invalidate cache for specific book
    if (req.method === 'DELETE' && pathParts[1] === 'cache' && pathParts[2]) {
      const cacheBookId = parseInt(pathParts[2], 10);
      if (isNaN(cacheBookId)) {
        this.sendJson(res, 400, { error: 'Invalid book ID' });
        return true;
      }
      
      if (!this.sparseCache) {
        this.sendJson(res, 200, { invalidated: false, reason: 'Cache not enabled' });
        return true;
      }
      
      await this.sparseCache.invalidate(cacheBookId);
      this.logEvent('cache', `Invalidated cache for book ${cacheBookId}`);
      
      this.sendJson(res, 200, { invalidated: true, bookId: cacheBookId });
      return true;
    }

    // GET /api/p2p/rooms - Get active P2P rooms
    if (pathParts[1] === 'p2p' && pathParts[2] === 'rooms') {
      const rooms = this.p2pSignaling.getRooms();
      this.sendJson(res, 200, { rooms });
      return true;
    }

    // GET /api/bookmarks - List all bookmarks
    if (pathParts[1] === 'bookmarks' && !pathParts[2] && req.method === 'GET') {
      const bookmarks = listBookmarks();
      this.sendJson(res, 200, bookmarks);
      return true;
    }

    // POST /api/bookmarks - Save a bookmark
    if (pathParts[1] === 'bookmarks' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { name, info } = JSON.parse(body);
          if (!name || !info || !info.bookId) {
            this.sendJson(res, 400, { error: 'Missing name or bookmark info' });
            return;
          }
          saveBookmark(name, info as BookmarkInfo);
          this.logEvent('bookmark', `Saved bookmark "${name}" for book ${info.bookId}`);
          this.sendJson(res, 200, { success: true, name });
        } catch (err) {
          this.sendJson(res, 400, { error: 'Invalid JSON' });
        }
      });
      return true;
    }

    // DELETE /api/bookmarks/:name - Delete a bookmark
    if (pathParts[1] === 'bookmarks' && pathParts[2] && req.method === 'DELETE') {
      const name = decodeURIComponent(pathParts[2]);
      if (deleteBookmark(name)) {
        this.logEvent('bookmark', `Deleted bookmark "${name}"`);
        this.sendJson(res, 200, { success: true, deleted: name });
      } else {
        this.sendJson(res, 404, { error: 'Bookmark not found' });
      }
      return true;
    }

    // GET /api/lastpos - Get last reading position
    if (pathParts[1] === 'lastpos' && req.method === 'GET') {
      const lastPos = loadLastPosition();
      this.sendJson(res, 200, lastPos);
      return true;
    }

    // POST /api/lastpos - Save last reading position
    if (pathParts[1] === 'lastpos' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const pos = JSON.parse(body) as LastPosition;
          if (!pos.bookId) {
            this.sendJson(res, 400, { error: 'Missing bookId' });
            return;
          }
          pos.timestamp = Date.now();
          saveLastPosition(pos);
          this.logEvent('lastpos', `Saved position: book ${pos.bookId} at byte ${pos.byteStart}`);
          this.sendJson(res, 200, { success: true });
        } catch (err) {
          this.sendJson(res, 400, { error: 'Invalid JSON' });
        }
      });
      return true;
    }

    // DELETE /api/lastpos - Clear last reading position
    if (pathParts[1] === 'lastpos' && req.method === 'DELETE') {
      clearLastPosition();
      this.sendJson(res, 200, { success: true });
      return true;
    }

    // Book endpoints: /api/book/:id/...
    if (pathParts[1] !== 'book') {
      return false;
    }

    const bookId = parseInt(pathParts[2], 10);
    if (isNaN(bookId)) {
      this.sendJson(res, 400, { error: 'Invalid book ID' });
      return true;
    }

    try {
      const startTime = Date.now();
      const navigator = await this.getNavigator(bookId);
      const action = pathParts[3];

      if (action === 'init') {
        const chunkSize = parseInt(url.searchParams.get('chunkSize') || '', 10) || this.chunkSize;
        const originalChunkSize = navigator.chunkSize;
        navigator.chunkSize = chunkSize;

        const position = await navigator._fetchChunkAt(
          navigator.boundaries.startByte,
          0,
          'forward'
        );

        navigator.chunkSize = originalChunkSize;

        const actualId = navigator.actualBookId || bookId;
        const duration = Date.now() - startTime;
        if (actualId !== bookId) {
          this.logEvent('init', `book ${bookId} → ${actualId} (fallback), ${position.actualCount}w`, duration);
        } else {
          this.logEvent('init', `book ${bookId}, ${position.actualCount}w`, duration);
        }

        const response: ChunkResponse = {
          bookId: actualId,
          requestedBookId: bookId,
          ...position,
          chunkSize,
          totalBytes: navigator.boundaries.cleanLength,
          docStart: navigator.boundaries.startByte,
          docEnd: navigator.boundaries.endByte
        };

        this.sendJson(res, 200, response);
        return true;
      }

      if (action === 'chunk') {
        const byteStart = parseInt(url.searchParams.get('byteStart') || '', 10);
        if (isNaN(byteStart)) {
          this.sendJson(res, 400, { error: 'Invalid byteStart' });
          return true;
        }

        const chunkSize = parseInt(url.searchParams.get('chunkSize') || '', 10) || this.chunkSize;
        const exact = url.searchParams.get('exact') === '1';
        
        // Exact mode: return raw bytes without word alignment (for excerpts)
        if (exact) {
          const fetcher = new Fetcher(bookId, false, { mirrorManager: this.mirrorManager });
          const rawBytes = await fetcher.fetchRange(byteStart, byteStart + chunkSize - 1);
          const text = rawBytes.toString('utf-8');
          
          this.logEvent('chunk-exact', `book ${bookId} @${byteStart}, ${chunkSize}B`, Date.now() - startTime);
          
          this.sendJson(res, 200, {
            bookId,
            byteStart,
            byteEnd: byteStart + rawBytes.length - 1,
            text,
            exact: true
          });
          return true;
        }
        
        const originalChunkSize = navigator.chunkSize;
        navigator.chunkSize = chunkSize;

        const position = await navigator._fetchChunkAt(byteStart, 0, 'forward');

        navigator.chunkSize = originalChunkSize;

        this.logEvent('chunk', `book ${bookId} @${byteStart}, ${position.actualCount}w, ${position.percent}%`, Date.now() - startTime);

        const response: ChunkResponse = {
          bookId,
          ...position,
          chunkSize,
          totalBytes: navigator.boundaries.cleanLength,
          docStart: navigator.boundaries.startByte,
          docEnd: navigator.boundaries.endByte
        };

        this.sendJson(res, 200, response);
        return true;
      }

      this.sendJson(res, 404, { error: 'Unknown action' });
      return true;

    } catch (err) {
      this.logError(`book ${bookId}`, err as Error);
      console.error(`API Error: ${(err as Error).message}`);
      this.sendJson(res, 500, { error: (err as Error).message });
      return true;
    }
  }

  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  }

  private serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    // Landing page with search
    if (req.url === '/' || req.url === '/index.html') {
      const htmlPath = path.join(__dirname, 'web-landing.html');
      fs.readFile(htmlPath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading landing page');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
      return true;
    }

    // Reader UI
    if (req.url === '/read' || req.url?.startsWith('/read?') || req.url?.startsWith('/read#')) {
      const htmlPath = path.join(__dirname, 'web-ui.html');
      fs.readFile(htmlPath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading reader');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
      return true;
    }

    return false;
  }

  async start(): Promise<http.Server> {
    // Initialize mirror manager
    console.log('🌐 Initializing mirror manager...');
    try {
      const mirrorStatus = await this.mirrorManager.initialize();
      console.log(`✓ ${mirrorStatus.mirrorCount} mirrors available`);
      this.logEvent('mirrors', `Initialized ${mirrorStatus.mirrorCount} mirrors`);
      if (mirrorStatus.mirrors.length > 0) {
        console.log(`   Primary: ${mirrorStatus.mirrors[0].provider}`);
      }
    } catch (err) {
      console.log(`⚠️  Mirror init warning: ${(err as Error).message}`);
      console.log('   Will use gutenberg.org directly');
      this.logEvent('mirrors', `Init warning: ${(err as Error).message}`);
    }

    // Initialize local cache
    if (this.useLocalCache && this.sparseCache) {
      console.log('💾 Local sparse cache enabled');
      const cachedBooks = this.sparseCache.listCachedBooks();
      if (cachedBooks.length > 0) {
        console.log(`   ${cachedBooks.length} books already cached`);
      }
      this.logEvent('cache', `Local sparse cache enabled, ${cachedBooks.length} books cached`);
    } else {
      console.log('💾 Local cache disabled');
    }

    // Initialize catalog
    console.log('📚 Checking Gutenberg catalog...');
    
    // Connect catalog log callback to server event log
    this.catalog.setLogCallback((type, message) => {
      this.logEvent(type, message);
    });
    
    try {
      await this.catalog.ensureCatalog();
    } catch (err) {
      console.log(`⚠️  Catalog unavailable: ${(err as Error).message}`);
      console.log('   Search will not work until catalog is downloaded.\n');
    }
    
    // Schedule hourly catalog refresh checks
    const CATALOG_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
    setInterval(async () => {
      try {
        await this.catalog.ensureCatalog();
      } catch (err) {
        this.logEvent('catalog', `Scheduled refresh failed: ${(err as Error).message}`);
      }
    }, CATALOG_CHECK_INTERVAL);

    const server = http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
      }

      if (await this.handleApi(req, res)) {
        return;
      }

      if (this.serveStatic(req, res)) {
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(this.port, () => {
      console.log(`\n📖 Gutex Web UI running at http://localhost:${this.port}`);
      console.log(`\nPages:`);
      console.log(`  http://localhost:${this.port}/           Search for books`);
      console.log(`  http://localhost:${this.port}/read#1342  Read a specific book`);
      console.log(`\nCache API:`);
      console.log(`  GET  /api/cache         - Cache status`);
      console.log(`  GET  /api/cache/:id     - Book cache status`);
      console.log(`  DELETE /api/cache/:id   - Invalidate book cache`);
      console.log(`\nP2P Multiplayer:`);
      console.log(`  WebSocket signaling at ws://localhost:${this.port}/ws/signaling`);
      console.log(`\nPress Ctrl+C to stop\n`);
    });

    // Attach P2P signaling server
    this.p2pSignaling.attach(server);

    return server;
  }

  /**
   * Get active P2P rooms (for debug/admin)
   */
  getP2PRooms(): object[] {
    return this.p2pSignaling.getRooms();
  }
}
