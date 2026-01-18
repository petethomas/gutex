/**
 * Network-Efficient Text Search
 * 
 * Searches text files via HTTP byte-range requests without full download.
 * Uses KMP for exact matching and Bitap for fuzzy matching with Levenshtein distance.
 * Adaptive chunk sizing minimizes network round-trips.
 */

import https from 'https';
import http from 'http';

// ============================================================
// Types
// ============================================================

/**
 * A pure function type for fetching byte ranges.
 * Inject a cached fetcher to avoid redundant network requests.
 */
export type RangeFetcher = (start: number, end: number) => Promise<Buffer>;

export interface SearchMatch {
  /** Byte position in file where match starts */
  position: number;
  /** The matched text */
  matchedText: string;
  /** Context around the match */
  context: string;
  /** Edit distance (0 for exact, >0 for fuzzy) */
  editDistance: number;
  /** Byte position for navigation */
  byteStart: number;
}

export interface SearchResult {
  found: boolean;
  matches: SearchMatch[];
  bytesDownloaded: number;
  chunksRequested: number;
  searchTimeMs: number;
  strategy: 'full-download' | 'range-search';
}

export interface SearchOptions {
  /** Enable fuzzy matching with edit distance */
  fuzzy?: boolean;
  /** Maximum edit distance for fuzzy matching (default: 2) */
  maxEditDistance?: number;
  /** Maximum number of matches to return (default: 50) */
  maxMatches?: number;
  /** Context characters around each match (default: 100) */
  contextSize?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Optional cached range fetcher - inject to enable caching */
  rangeFetcher?: RangeFetcher;
}

interface ChunkResult {
  data: Buffer;
  start: number;
  end: number;
}

// ============================================================
// KMP Streaming Search (Exact Matching)
// ============================================================

class StreamingKMP {
  private pattern: string;
  private lps: number[];  // Longest Proper Prefix which is also Suffix
  private state: number = 0;
  
  constructor(pattern: string) {
    this.pattern = pattern.toLowerCase();
    this.lps = this.computeLPS(this.pattern);
  }
  
  private computeLPS(pattern: string): number[] {
    const lps = new Array(pattern.length).fill(0);
    let len = 0;
    let i = 1;
    
    while (i < pattern.length) {
      if (pattern[i] === pattern[len]) {
        len++;
        lps[i] = len;
        i++;
      } else {
        if (len !== 0) {
          len = lps[len - 1];
        } else {
          lps[i] = 0;
          i++;
        }
      }
    }
    return lps;
  }
  
  /**
   * Process a chunk of text, returning match positions (global byte offsets)
   * State is preserved between calls for streaming.
   */
  processChunk(chunk: string, globalOffset: number): number[] {
    const matches: number[] = [];
    const text = chunk.toLowerCase();
    
    for (let i = 0; i < text.length; i++) {
      while (this.state > 0 && text[i] !== this.pattern[this.state]) {
        this.state = this.lps[this.state - 1];
      }
      
      if (text[i] === this.pattern[this.state]) {
        this.state++;
      }
      
      if (this.state === this.pattern.length) {
        const matchPos = globalOffset + i - this.pattern.length + 1;
        matches.push(matchPos);
        this.state = this.lps[this.state - 1];
      }
    }
    
    return matches;
  }
  
  /** Reset state for new search */
  reset(): void {
    this.state = 0;
  }
  
  /** Get pattern length for overlap calculation */
  get patternLength(): number {
    return this.pattern.length;
  }
}

// ============================================================
// Bitap Algorithm (Fuzzy Matching with Edit Distance)
// ============================================================

class BitapSearcher {
  private pattern: string;
  private patternMask: Map<string, number>;
  private maxErrors: number;
  
  constructor(pattern: string, maxErrors: number = 2) {
    this.pattern = pattern.toLowerCase();
    this.maxErrors = Math.min(maxErrors, 3); // Cap at 3 for performance
    this.patternMask = this.computePatternMask();
  }
  
  private computePatternMask(): Map<string, number> {
    const mask = new Map<string, number>();
    const m = this.pattern.length;
    
    // Initialize all characters to ~0 (all bits set)
    // Then clear bit j for each position j where char appears
    for (let i = 0; i < m; i++) {
      const char = this.pattern[i];
      const current = mask.get(char) ?? ~0;
      mask.set(char, current & ~(1 << i));
    }
    
    return mask;
  }
  
  /**
   * Search for approximate matches in text chunk.
   * Returns array of {position, editDistance} for matches within maxErrors.
   */
  processChunk(chunk: string, globalOffset: number): Array<{position: number; editDistance: number}> {
    const matches: Array<{position: number; editDistance: number}> = [];
    const text = chunk.toLowerCase();
    const m = this.pattern.length;
    const k = this.maxErrors;
    
    if (m > 31) {
      // Bitap limited to 31 chars with 32-bit integers
      // Fall back to word-by-word Levenshtein for longer patterns
      return this.fallbackSearch(text, globalOffset);
    }
    
    // R[d] = bit vector for d errors
    const R: number[] = new Array(k + 1).fill(~0);
    const matchBit = 1 << (m - 1);
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const patternBit = this.patternMask.get(char) ?? ~0;
      
      // Save old values for diagonal transitions
      const oldR = [...R];
      
      // Exact match (0 errors)
      R[0] = ((R[0] << 1) | patternBit);
      
      // Approximate matches (1 to k errors)
      for (let d = 1; d <= k; d++) {
        R[d] = ((R[d] << 1) | patternBit)  // Match or substitution
             & (oldR[d - 1] << 1)           // Substitution
             & (R[d - 1] << 1)              // Insertion
             & oldR[d - 1];                 // Deletion
      }
      
      // Check for matches at each error level
      for (let d = 0; d <= k; d++) {
        if ((R[d] & matchBit) === 0) {
          const position = globalOffset + i - m + 1;
          // Skip positions before start of text (partial matches at beginning)
          if (position < 0) continue;
          // Avoid duplicate matches at same position
          if (matches.length === 0 || matches[matches.length - 1].position !== position) {
            matches.push({ position, editDistance: d });
          }
          break; // Report best (lowest error) match only
        }
      }
    }
    
    return matches;
  }
  
  /**
   * Fallback for patterns > 31 chars: word-level matching
   */
  private fallbackSearch(text: string, globalOffset: number): Array<{position: number; editDistance: number}> {
    const matches: Array<{position: number; editDistance: number}> = [];
    const patternWords = this.pattern.split(/\s+/);
    const textWords = text.split(/\s+/);
    
    // Sliding window over text words
    for (let i = 0; i <= textWords.length - patternWords.length; i++) {
      let totalDistance = 0;
      let valid = true;
      
      for (let j = 0; j < patternWords.length && valid; j++) {
        const dist = this.levenshteinDistance(patternWords[j], textWords[i + j]);
        if (dist > Math.ceil(patternWords[j].length * 0.3)) {
          valid = false;
        }
        totalDistance += dist;
      }
      
      if (valid && totalDistance <= this.maxErrors * patternWords.length) {
        // Estimate byte position (rough approximation)
        const prefix = textWords.slice(0, i).join(' ');
        const position = globalOffset + prefix.length + (i > 0 ? 1 : 0);
        matches.push({ position, editDistance: totalDistance });
      }
    }
    
    return matches;
  }
  
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  get patternLength(): number {
    return this.pattern.length;
  }
}

// ============================================================
// Adaptive Chunk Fetcher
// ============================================================

class AdaptiveChunkFetcher {
  private url: string;
  private fileSize: number;
  private chunkSize: number;
  private consecutiveMisses: number = 0;
  private bytesDownloaded: number = 0;
  private chunksRequested: number = 0;
  private debug: boolean;
  private customFetcher?: RangeFetcher;
  
  // Chunk size bounds
  private readonly MIN_CHUNK = 16 * 1024;  // 16KB
  private readonly MAX_CHUNK = 128 * 1024; // 128KB
  
  constructor(url: string, fileSize: number, debug: boolean = false, customFetcher?: RangeFetcher) {
    this.url = url;
    this.fileSize = fileSize;
    this.chunkSize = this.MIN_CHUNK;
    this.debug = debug;
    this.customFetcher = customFetcher;
  }
  
  /**
   * Fetch a specific byte range.
   * Uses injected fetcher if provided (enables caching), otherwise direct HTTP.
   */
  async fetchRange(start: number, end: number): Promise<Buffer> {
    end = Math.min(end, this.fileSize - 1);
    if (start >= this.fileSize || start > end) {
      return Buffer.alloc(0);
    }
    
    this.chunksRequested++;
    const size = end - start + 1;
    this.bytesDownloaded += size;
    
    if (this.debug) {
      console.error(`[FETCH] Range ${start}-${end} (${size} bytes), total: ${this.bytesDownloaded}`);
    }
    
    // Use injected fetcher if available (cached path)
    if (this.customFetcher) {
      return this.customFetcher(start, end);
    }
    
    // Default: direct HTTP
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(this.url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Range': `bytes=${start}-${end}`,
          'User-Agent': 'Gutex/1.0'
        }
      };
      
      const req = lib.request(options, (res) => {
        if (res.statusCode !== 206 && res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }
  
  /**
   * Generator for adaptive chunk iteration with overlap
   */
  async *iterateChunks(
    startByte: number,
    endByte: number,
    overlap: number
  ): AsyncGenerator<ChunkResult> {
    let position = startByte;
    
    while (position < endByte) {
      const chunkEnd = Math.min(position + this.chunkSize - 1, endByte);
      const data = await this.fetchRange(position, chunkEnd);
      
      if (data.length === 0) break;
      
      yield { data, start: position, end: position + data.length - 1 };
      
      // Move position, accounting for overlap to catch boundary-spanning matches
      position += this.chunkSize - overlap;
    }
  }
  
  /**
   * Report a miss (no match found in chunk) - may increase chunk size
   */
  reportMiss(): void {
    this.consecutiveMisses++;
    if (this.consecutiveMisses >= 3 && this.chunkSize < this.MAX_CHUNK) {
      this.chunkSize = Math.min(this.chunkSize * 2, this.MAX_CHUNK);
      this.consecutiveMisses = 0;
      if (this.debug) {
        console.error(`[ADAPTIVE] Increased chunk size to ${this.chunkSize}`);
      }
    }
  }
  
  /**
   * Report a hit (match found) - resets miss counter
   */
  reportHit(): void {
    this.consecutiveMisses = 0;
  }
  
  getStats(): { bytesDownloaded: number; chunksRequested: number } {
    return {
      bytesDownloaded: this.bytesDownloaded,
      chunksRequested: this.chunksRequested
    };
  }
}

// ============================================================
// Main Network Search Class
// ============================================================

export class NetworkSearcher {
  // Threshold: below this, full download is more efficient
  private readonly SMALL_FILE_THRESHOLD = 50 * 1024; // 50KB
  
  // Gutenberg boilerplate sizes to skip
  private readonly HEADER_SKIP = 500;
  private readonly FOOTER_SKIP = 4000;
  
  private debug: boolean;
  
  constructor(debug: boolean = false) {
    this.debug = debug;
  }
  
  /**
   * Validate search phrase - must be at least 4 words
   */
  validatePhrase(phrase: string): { valid: boolean; error?: string; words?: string[] } {
    const words = phrase.trim().split(/\s+/).filter(w => w.length > 0);
    
    if (words.length < 4) {
      return {
        valid: false,
        error: 'Search phrase must contain at least 4 words for network-efficient search'
      };
    }
    
    if (phrase.length < 10) {
      return {
        valid: false,
        error: 'Search phrase too short'
      };
    }
    
    return { valid: true, words };
  }
  
  /**
   * Get file size via HEAD request
   */
  async getFileSize(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'HEAD'
      };
      
      const req = lib.request(options, (res) => {
        const contentLength = res.headers['content-length'];
        if (contentLength) {
          resolve(parseInt(contentLength, 10));
        } else {
          reject(new Error('No Content-Length header'));
        }
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('HEAD request timeout'));
      });
      req.end();
    });
  }
  
  /**
   * Full download search for small files
   */
  async searchFullDownload(
    url: string,
    phrase: string,
    options: SearchOptions
  ): Promise<SearchResult> {
    const startTime = Date.now();
    
    const response = await this.fetchFullFile(url);
    const text = response.toString('utf-8');
    
    const matches = options.fuzzy
      ? this.fuzzySearchText(text, phrase, options)
      : this.exactSearchText(text, phrase, options);
    
    return {
      found: matches.length > 0,
      matches: matches.slice(0, options.maxMatches || 50),
      bytesDownloaded: response.length,
      chunksRequested: 1,
      searchTimeMs: Date.now() - startTime,
      strategy: 'full-download'
    };
  }
  
  private async fetchFullFile(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      
      const req = lib.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
  
  /**
   * Range-based search for larger files
   */
  async searchWithRanges(
    url: string,
    fileSize: number,
    phrase: string,
    options: SearchOptions
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const maxMatches = options.maxMatches || 50;
    const contextSize = options.contextSize || 100;
    
    // Calculate search bounds (skip Gutenberg header/footer)
    const searchStart = Math.min(this.HEADER_SKIP, fileSize);
    const searchEnd = Math.max(searchStart, fileSize - this.FOOTER_SKIP);
    
    const fetcher = new AdaptiveChunkFetcher(url, fileSize, this.debug, options.rangeFetcher);
    const matches: SearchMatch[] = [];
    
    if (options.fuzzy) {
      const searcher = new BitapSearcher(phrase, options.maxEditDistance || 2);
      const overlap = searcher.patternLength - 1;
      
      for await (const chunk of fetcher.iterateChunks(searchStart, searchEnd, overlap)) {
        const text = chunk.data.toString('utf-8');
        const chunkMatches = searcher.processChunk(text, chunk.start);
        
        if (chunkMatches.length > 0) {
          fetcher.reportHit();
          
          for (const m of chunkMatches) {
            if (matches.length >= maxMatches) break;
            
            // Extract context
            const localPos = m.position - chunk.start;
            const contextStart = Math.max(0, localPos - contextSize);
            const contextEnd = Math.min(text.length, localPos + phrase.length + contextSize);
            const context = text.slice(contextStart, contextEnd);
            const matchedText = text.slice(localPos, localPos + phrase.length);
            
            matches.push({
              position: m.position,
              matchedText,
              context,
              editDistance: m.editDistance,
              byteStart: m.position
            });
          }
        } else {
          fetcher.reportMiss();
        }
        
        if (matches.length >= maxMatches) break;
      }
    } else {
      const searcher = new StreamingKMP(phrase);
      const overlap = searcher.patternLength - 1;
      
      // We need to track text for context extraction
      let prevChunkTail = '';
      
      for await (const chunk of fetcher.iterateChunks(searchStart, searchEnd, overlap)) {
        const text = chunk.data.toString('utf-8');
        const combinedText = prevChunkTail + text;
        const offsetAdjust = prevChunkTail.length;
        
        const chunkMatches = searcher.processChunk(combinedText, chunk.start - offsetAdjust);
        
        if (chunkMatches.length > 0) {
          fetcher.reportHit();
          
          for (const pos of chunkMatches) {
            if (matches.length >= maxMatches) break;
            
            // Fetch context around match if needed
            const match = await this.extractMatchWithContext(
              fetcher,
              pos,
              phrase,
              contextSize,
              combinedText,
              chunk.start - offsetAdjust
            );
            
            matches.push(match);
          }
        } else {
          fetcher.reportMiss();
        }
        
        // Keep tail for boundary-spanning context
        prevChunkTail = text.slice(-contextSize);
        
        if (matches.length >= maxMatches) break;
      }
    }
    
    const stats = fetcher.getStats();
    
    return {
      found: matches.length > 0,
      matches,
      bytesDownloaded: stats.bytesDownloaded,
      chunksRequested: stats.chunksRequested,
      searchTimeMs: Date.now() - startTime,
      strategy: 'range-search'
    };
  }
  
  private async extractMatchWithContext(
    fetcher: AdaptiveChunkFetcher,
    position: number,
    phrase: string,
    contextSize: number,
    chunkText: string,
    chunkStart: number
  ): Promise<SearchMatch> {
    const localPos = position - chunkStart;
    
    // Try to extract from current chunk
    if (localPos >= 0 && localPos + phrase.length <= chunkText.length) {
      const contextStart = Math.max(0, localPos - contextSize);
      const contextEnd = Math.min(chunkText.length, localPos + phrase.length + contextSize);
      
      return {
        position,
        matchedText: chunkText.slice(localPos, localPos + phrase.length),
        context: chunkText.slice(contextStart, contextEnd),
        editDistance: 0,
        byteStart: position
      };
    }
    
    // Need to fetch more context
    const fetchStart = Math.max(0, position - contextSize);
    const fetchEnd = position + phrase.length + contextSize;
    const contextData = await fetcher.fetchRange(fetchStart, fetchEnd);
    const contextText = contextData.toString('utf-8');
    const matchStart = position - fetchStart;
    
    return {
      position,
      matchedText: contextText.slice(matchStart, matchStart + phrase.length),
      context: contextText,
      editDistance: 0,
      byteStart: position
    };
  }
  
  /**
   * Simple exact search on full text (for small files)
   */
  private exactSearchText(text: string, phrase: string, options: SearchOptions): SearchMatch[] {
    const matches: SearchMatch[] = [];
    const lowerText = text.toLowerCase();
    const lowerPhrase = phrase.toLowerCase();
    const contextSize = options.contextSize || 100;
    
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerPhrase, pos)) !== -1) {
      const contextStart = Math.max(0, pos - contextSize);
      const contextEnd = Math.min(text.length, pos + phrase.length + contextSize);
      
      matches.push({
        position: pos,
        matchedText: text.slice(pos, pos + phrase.length),
        context: text.slice(contextStart, contextEnd),
        editDistance: 0,
        byteStart: pos
      });
      
      pos += 1;
      
      if (matches.length >= (options.maxMatches || 50)) break;
    }
    
    return matches;
  }
  
  /**
   * Fuzzy search on full text (for small files)
   */
  private fuzzySearchText(text: string, phrase: string, options: SearchOptions): SearchMatch[] {
    const searcher = new BitapSearcher(phrase, options.maxEditDistance || 2);
    const rawMatches = searcher.processChunk(text, 0);
    const contextSize = options.contextSize || 100;
    
    return rawMatches.slice(0, options.maxMatches || 50).map(m => {
      const contextStart = Math.max(0, m.position - contextSize);
      const contextEnd = Math.min(text.length, m.position + phrase.length + contextSize);
      
      return {
        position: m.position,
        matchedText: text.slice(m.position, m.position + phrase.length),
        context: text.slice(contextStart, contextEnd),
        editDistance: m.editDistance,
        byteStart: m.position
      };
    });
  }
  
  /**
   * Main search entry point
   */
  async search(
    url: string,
    phrase: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    // Validate phrase
    const validation = this.validatePhrase(phrase);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    // Get file size to decide strategy
    let fileSize: number;
    try {
      fileSize = await this.getFileSize(url);
    } catch (err) {
      // If HEAD fails, fall back to full download
      if (this.debug) {
        console.error(`[SEARCH] HEAD failed, using full download: ${(err as Error).message}`);
      }
      return this.searchFullDownload(url, phrase, options);
    }
    
    if (this.debug) {
      console.error(`[SEARCH] File size: ${fileSize} bytes, threshold: ${this.SMALL_FILE_THRESHOLD}`);
    }
    
    // Choose strategy based on file size
    if (fileSize < this.SMALL_FILE_THRESHOLD) {
      return this.searchFullDownload(url, phrase, options);
    }
    
    return this.searchWithRanges(url, fileSize, phrase, options);
  }
}

// ============================================================
// Exports for testing
// ============================================================

export { StreamingKMP, BitapSearcher, AdaptiveChunkFetcher };
