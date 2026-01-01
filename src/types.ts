/**
 * Shared type definitions for Gutex
 */

// ============================================================================
// Navigation Types
// ============================================================================

/**
 * Represents a position/chunk in the book with navigation metadata
 */
export interface Position {
  /** Array of words in this chunk */
  words: string[];
  /** Pre-formatted text preserving paragraph breaks */
  formattedText?: string;
  /** Index of first word in this chunk */
  wordIndex: number;
  /** Actual number of words returned */
  actualCount: number;
  /** Position as percentage through the book */
  percent: string;
  /** Whether we're near the end of the book */
  isNearEnd: boolean;
  /** Starting byte position of this chunk */
  byteStart: number;
  /** Ending byte position of this chunk */
  byteEnd: number;
  /** Byte position where next chunk should start */
  nextByteStart?: number;
  /** Byte position where previous chunk ends */
  previousByteEnd?: number;
  /** Saved byte start for history restoration */
  savedByteStart?: number;
  /** Saved byte end for history restoration */
  savedByteEnd?: number;
}

/**
 * Clean content boundaries within a Gutenberg text file
 */
export interface Boundaries {
  /** Byte offset where clean content starts */
  startByte: number;
  /** Byte offset where clean content ends */
  endByte: number;
  /** Length of clean content in bytes */
  cleanLength: number;
  /** Metadata about the cleaning process */
  meta?: BoundaryMeta;
}

export interface BoundaryMeta {
  isAustralian?: boolean;
  hadSmallPrint?: boolean;
  startMarkerFound?: boolean;
  endMarkerFound?: boolean;
}

/**
 * Result of fetching a range with UTF-8 boundary handling
 */
export interface FetchRangeResult {
  text: string;
  actualStart: number;
  actualEnd: number;
  startsAtWordBoundary: boolean;
}

/**
 * Cached chunk data
 */
export interface CachedChunk {
  text: string;
  actualStart: number;
  actualEnd: number;
  startsAtWordBoundary: boolean;
}

/**
 * Word/token position within a chunk
 */
export interface WordPosition {
  word: string;
  isBreak: boolean;
  startBytes: number;
  endBytes: number;
}

// ============================================================================
// Mirror/Network Types
// ============================================================================

/**
 * A Project Gutenberg mirror server
 */
export interface Mirror {
  baseUrl: string;
  provider: string;
  location: string;
  note?: string;
  continent?: string;
}

/**
 * Statistics for a mirror's performance
 */
export interface MirrorStats {
  successes: number;
  failures: number;
  avgResponseTime: number | null;
  lastSuccess: number | null;
  lastFailure: number | null;
}

/**
 * Result of a mirror request
 */
export interface MirrorRequestResult<T> {
  success: boolean;
  result?: T;
  mirror: Mirror;
  elapsed?: number;
  error?: Error;
  source?: string;
}

/**
 * Response from HTTP request
 */
export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body?: Buffer;
  url: string;
}

/**
 * HEAD request result
 */
export interface HeadResult {
  url: string;
  contentLength: number;
  mirror: Mirror;
}

/**
 * GET request result
 */
export interface GetResult {
  body: Buffer;
  url: string;
  mirror: Mirror;
}

/**
 * Fetcher statistics
 */
export interface FetcherStats {
  requests: number;
  bytesDownloaded: number;
  totalBytes: number | null;
  efficiency: string;
  mirror: string;
}

/**
 * Fetcher constructor options
 */
export interface FetcherOptions {
  useMirrors?: boolean;
  mirrorManager?: MirrorManagerInterface | null;
  logCallback?: LogCallback | null;
}

/**
 * Log callback function type
 */
export type LogCallback = (type: string, message: string) => void;

/**
 * Fetcher interface for dependency injection in tests
 */
export interface FetcherInterface {
  totalBytes: number | null;
  fetchRange(start: number, end: number): Promise<Buffer>;
  fetchHead(): Promise<number>;
  getStats(): FetcherStats;
}

/**
 * Mirror manager interface for dependency injection
 */
export interface MirrorManagerInterface {
  initialize(): Promise<MirrorInitResult>;
  headWithFallback(bookId: number, logCallback?: LogCallback | null): Promise<HeadResult>;
  getWithFallback(bookId: number, options?: GetOptions, logCallback?: LogCallback | null): Promise<GetResult>;
  getStatus(): MirrorStatus;
  clearBookMirror(bookId: number): void;
}

export interface MirrorInitResult {
  mirrorCount: number;
  mirrors: Array<{ provider: string; location: string; baseUrl: string }>;
}

export interface GetOptions {
  range?: string;
}

export interface MirrorStatus {
  initialized: boolean;
  mirrorCount: number;
  stickyBooks: number;
  mirrors: Array<{
    provider: string;
    location: string;
    baseUrl: string;
    stats: MirrorStats;
  }>;
}

// ============================================================================
// Catalog Types
// ============================================================================

/**
 * A book record from the Gutenberg catalog
 */
export interface CatalogRecord {
  id: string;
  title: string;
  author: string | null;
  year: string | null;
  language: string | null;
}

/**
 * Search result from the catalog
 */
export interface SearchResult extends CatalogRecord {}

/**
 * Catalog metadata stored on disk
 */
export interface CatalogMeta {
  sha256?: string;
  downloadDate?: string;
  lastCheck?: number;
}

// ============================================================================
// CLI Types
// ============================================================================

/**
 * Parsed CLI options
 */
export interface CliOptionsData {
  snapshot: boolean;
  raw: boolean;
  bookId: number | null;
  chunkSize: number | null;
  startPercent: number | null;
  errors: string[];
}

// ============================================================================
// Display Types
// ============================================================================

/**
 * Display constructor options
 */
export interface DisplayOptions {
  showChrome?: boolean;
  bookId?: number;
}

/**
 * Terminal dimensions
 */
export interface TerminalSize {
  rows: number;
  cols: number;
}

// ============================================================================
// Web Server Types
// ============================================================================

/**
 * Web server constructor options
 */
export interface WebServerOptions {
  port?: number;
  chunkSize?: number;
  debug?: boolean;
  /** Enable sparse file caching of Gutenberg texts (default: true) */
  useLocalCache?: boolean;
  /** Cache directory path (default: .cache/sparse in project root) */
  cacheDir?: string;
}

/**
 * Request log entry
 */
export interface RequestLogEntry {
  type: string;
  bookId: number;
  start?: number;
  end?: number;
  bytes?: number;
  duration: number;
  mirror?: string;
  cached?: boolean;
  timestamp: number;
}

/**
 * Event log entry
 */
export interface EventLogEntry {
  type: string;
  message: string;
  duration: number | null;
  timestamp: number;
  errorCode?: string | null;
  stack?: string;
  [key: string]: unknown;
}

/**
 * API response for book chunk
 */
export interface ChunkResponse extends Position {
  bookId: number;
  requestedBookId?: number;
  chunkSize: number;
  totalBytes: number;
  docStart: number;
  docEnd: number;
}

// ============================================================================
// Cleaner Types
// ============================================================================

/**
 * Options for the Cleaner class
 */
export interface CleanerOptions {
  scanHeadLines?: number;
  scanTailLines?: number;
  maxFuzzyDist?: number;
  maxPrefixWindow?: number;
  headScanBytes?: number;
  tailScanBytes?: number;
}

/**
 * Start boundary detection result
 */
export interface StartBoundaryResult {
  byteOffset: number;
  lineIndex: number;
  found: boolean;
  isAustralian: boolean;
  hadSmallPrint: boolean;
}

/**
 * End boundary detection result
 */
export interface EndBoundaryResult {
  byteOffset: number | null;
  lineIndex: number;
  found: boolean;
}

// ============================================================================
// Keyboard Types
// ============================================================================

/**
 * Keyboard callback functions
 */
export interface KeyboardCallbacks {
  forward: (() => void) | null;
  backward: (() => void) | null;
  quit: (() => void) | null;
  // Enhanced features
  help: (() => void) | null;
  search: (() => void) | null;
  bookmarks: (() => void) | null;
  saveBookmark: (() => void) | null;
  gotoPercent: (() => void) | null;
  toggleAuto: (() => void) | null;
  autoFaster: (() => void) | null;
  autoSlower: (() => void) | null;
  reverseAuto: (() => void) | null;
  randomMenu: (() => void) | null;
  jumpAround: (() => void) | null;
  chunkBigger: (() => void) | null;
  chunkSmaller: (() => void) | null;
  debug: (() => void) | null;
  pageUp: (() => void) | null;
  pageDown: (() => void) | null;
  escape: (() => void) | null;
  annotate: (() => void) | null;
}

// ============================================================================
// Bookmark Types
// ============================================================================

/**
 * Bookmark information
 */
export interface BookmarkInfo {
  bookId: number;
  position: number;
  percent: string;
  timestamp: number;
  [key: string]: unknown;
}

/**
 * All bookmarks stored
 */
export interface BookmarksData {
  [name: string]: BookmarkInfo;
}

// ============================================================================
// GutexEnhanced Types
// ============================================================================

/**
 * GutexEnhanced constructor options
 */
export interface GutexEnhancedOptions {
  showChrome?: boolean;
}

// ============================================================================
// Navigator Extended Interface
// ============================================================================

/**
 * Extended navigator with web server additions
 */
export interface NavigatorWithMeta {
  actualBookId?: number;
  requestedBookId?: number;
  chunkSize: number;
  boundaries: Boundaries;
  _calibrateWordDensity(): Promise<void>;
  _fetchChunkAt(byteStart: number, targetWordIndex: number, direction: 'forward' | 'backward', byteEnd?: number | null): Promise<Position>;
}
