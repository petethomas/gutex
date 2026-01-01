/**
 * Navigator with dual-position tracking for symmetric bidirectional navigation.
 *
 * Key improvements:
 * - Tracks both previousByteEnd and nextByteStart for true symmetry
 * - Position history stack for perfect forward/backward reversibility
 * - LRU cache with predictive prefetching
 * - UTF-8 boundary safety on all range requests
 * - Exactly 1 HTTP request per movement (with cache hits)
 */

import { Cleaner } from './cleaner.js';
import type { Position, Boundaries, CachedChunk, FetchRangeResult, WordPosition } from './types.js';

interface FetcherInterface {
  fetchRange(start: number, end: number): Promise<Buffer>;
}

export class Navigator {
  private fetcher: FetcherInterface;
  public boundaries: Boundaries;
  public chunkSize: number;

  // Word density estimation
  private avgBytesPerWord = 6;
  private totalWords: number | null = null;
  private calibrationSamples: number[] = [];
  private maxCalibrationSamples = 10;

  // Position history for symmetric navigation (public for testing)
  public positionHistory: Position[] = [];
  public maxHistorySize = 50;
  private futureHistory: Position[] = [];

  // Chunk cache with LRU (public for testing)
  public chunkCache = new Map<string, CachedChunk>();
  private cacheLRU: string[] = [];
  public maxCacheSize = 10;

  // UTF-8 safety margin
  private safetyMargin = 4;

  // For web server - track book IDs
  public actualBookId?: number;
  public requestedBookId?: number;

  constructor(fetcher: FetcherInterface, boundaries: Boundaries, chunkSize: number) {
    this.fetcher = fetcher;
    this.boundaries = boundaries;
    this.chunkSize = chunkSize;
  }

  async goToPercent(percent: number): Promise<Position> {
    if (!this.totalWords) {
      await this._calibrateWordDensity();
    }

    const targetWord = Math.floor(this.totalWords! * (percent / 100));

    // Clear history when jumping to new position
    this.positionHistory = [];
    this.futureHistory = [];

    return await this._navigateToWord(targetWord);
  }

  async moveForward(currentPosition: Position): Promise<Position> {
    // Save current position to history BEFORE moving
    this.positionHistory.push({
      ...currentPosition,
      savedByteStart: currentPosition.byteStart,
      savedByteEnd: currentPosition.byteEnd
    });

    // Trim history if too large
    if (this.positionHistory.length > this.maxHistorySize) {
      this.positionHistory.shift();
    }

    // Clear future history
    this.futureHistory = [];

    const targetWord = currentPosition.wordIndex + this.chunkSize;

    // If we have the exact byte position where next chunk should start, use it
    if (currentPosition.nextByteStart !== undefined) {
      return await this._fetchChunkAt(
        currentPosition.nextByteStart,
        targetWord,
        'forward'
      );
    }

    // Fallback to estimation
    return await this._navigateToWord(targetWord);
  }

  async moveBackward(currentPosition: Position): Promise<Position> {
    // Check if we have position history
    if (this.positionHistory.length > 0) {
      // Save current to future history
      this.futureHistory.push({ ...currentPosition });

      // Restore previous position
      const previousPosition = this.positionHistory.pop()!;

      return previousPosition;
    }

    // No history - calculate backward position
    const targetWord = Math.max(0, currentPosition.wordIndex - this.chunkSize);

    // If we're at the start, stay there
    if (targetWord === 0 && currentPosition.wordIndex === 0) {
      return currentPosition;
    }

    // Use previousByteEnd if available
    if (currentPosition.previousByteEnd !== undefined) {
      return await this._fetchChunkBackward(
        currentPosition.previousByteEnd,
        targetWord
      );
    }

    // Fallback to estimation
    return await this._navigateToWord(targetWord);
  }

  async _calibrateWordDensity(): Promise<void> {
    const sampleSize = Math.min(2000, Math.floor(this.boundaries.cleanLength * 0.02));

    const samples = [
      { pos: 0.1, size: sampleSize },
      { pos: 0.6, size: sampleSize }
    ];

    let totalDensity = 0;

    for (const sample of samples) {
      const bytePos = this.boundaries.startByte + Math.floor(this.boundaries.cleanLength * sample.pos);
      const endByte = Math.min(bytePos + sample.size, this.boundaries.endByte);
      const text = await this._fetchRangeSafe(bytePos, endByte);
      const wordCount = Cleaner.countWords(text.text);
      const density = wordCount / text.text.length;
      totalDensity += density;
    }

    const avgDensity = totalDensity / samples.length;
    this.avgBytesPerWord = 1 / avgDensity;
    this.totalWords = Math.floor(this.boundaries.cleanLength * avgDensity);
  }

  private async _navigateToWord(targetWord: number): Promise<Position> {
    targetWord = Math.max(0, Math.min(targetWord, this.totalWords! - 1));

    const estimatedByteOffset = targetWord * this.avgBytesPerWord;
    const estimatedByte = this.boundaries.startByte + Math.floor(estimatedByteOffset);

    const safetyMargin = Math.floor(this.avgBytesPerWord * 20);
    const fetchSize = Math.floor(this.chunkSize * this.avgBytesPerWord * 2.5);

    const fetchStart = Math.max(this.boundaries.startByte, estimatedByte - safetyMargin);
    const fetchEnd = Math.min(this.boundaries.endByte, estimatedByte + fetchSize);

    return await this._fetchChunkAt(fetchStart, targetWord, 'forward', fetchEnd);
  }

  async _fetchChunkAt(
    byteStart: number,
    targetWordIndex: number,
    direction: 'forward' | 'backward' = 'forward',
    byteEnd: number | null = null
  ): Promise<Position> {
    // Calculate fetch range if not provided
    if (byteEnd === null) {
      const fetchSize = Math.floor(this.chunkSize * this.avgBytesPerWord * 2.5);
      byteEnd = Math.min(this.boundaries.endByte, byteStart + fetchSize);
    }

    // Check cache first
    const cacheKey = this._getCacheKey(byteStart, byteEnd);
    let chunk = this._getFromCache(cacheKey);

    if (!chunk) {
      // Fetch from server with UTF-8 safety
      const result = await this._fetchRangeSafe(byteStart, byteEnd);
      chunk = {
        text: result.text,
        actualStart: result.actualStart,
        actualEnd: result.actualEnd,
        startsAtWordBoundary: result.startsAtWordBoundary
      };

      // Add to cache
      this._addToCache(cacheKey, chunk);

      // Prefetch adjacent chunks
      this._prefetchAdjacent(byteStart, byteEnd, direction);
    }

    // Extract words from the fetched chunk
    return this._extractWords(chunk, targetWordIndex, direction);
  }

  private async _fetchChunkBackward(previousByteEnd: number, targetWordIndex: number): Promise<Position> {
    const fetchSize = Math.floor(this.chunkSize * this.avgBytesPerWord * 2.5);
    const byteEnd = previousByteEnd - 1;
    const byteStart = Math.max(this.boundaries.startByte, byteEnd - fetchSize);

    return await this._fetchChunkAt(byteStart, targetWordIndex, 'backward', byteEnd);
  }

  public async _fetchRangeSafe(startByte: number, endByte: number): Promise<FetchRangeResult> {
    // Add safety margins for UTF-8 boundaries
    const requestStart = Math.max(this.boundaries.startByte, startByte - this.safetyMargin);
    const requestEnd = Math.min(this.boundaries.endByte, endByte + this.safetyMargin);

    const buffer = await this.fetcher.fetchRange(requestStart, requestEnd);

    // Find first valid UTF-8 character boundary after start
    let actualStartOffset = startByte - requestStart;
    if (requestStart < startByte) {
      actualStartOffset = this._findUTF8Boundary(buffer, actualStartOffset, 'forward');
    } else {
      actualStartOffset = 0;
    }

    // Find last valid UTF-8 character boundary before end
    let actualEndOffset = Math.min(buffer.length - 1, endByte - requestStart);
    if (requestEnd > endByte) {
      actualEndOffset = this._findUTF8Boundary(buffer, actualEndOffset, 'backward');
    }

    const validText = buffer.slice(actualStartOffset, actualEndOffset + 1).toString('utf8');

    // Check if we're starting mid-word
    let startsAtWordBoundary = true;
    if (actualStartOffset > 0) {
      const prevByte = buffer[actualStartOffset - 1];
      const currByte = buffer[actualStartOffset];
      const prevIsWord = prevByte > 32 && prevByte !== 127;
      const currIsWord = currByte > 32 && currByte !== 127;
      startsAtWordBoundary = !prevIsWord || !currIsWord;
    }

    return {
      text: validText,
      actualStart: requestStart + actualStartOffset,
      actualEnd: requestStart + actualEndOffset,
      startsAtWordBoundary
    };
  }

  private _findUTF8Boundary(buffer: Buffer, offset: number, direction: 'forward' | 'backward'): number {
    const isUTF8Start = (byte: number): boolean => (byte & 0xC0) !== 0x80;
    
    // Get the length of a UTF-8 character from its start byte
    const utf8CharLen = (startByte: number): number => {
      if ((startByte & 0x80) === 0) return 1;      // ASCII (0xxxxxxx)
      if ((startByte & 0xE0) === 0xC0) return 2;   // 2-byte (110xxxxx)
      if ((startByte & 0xF0) === 0xE0) return 3;   // 3-byte (1110xxxx)
      if ((startByte & 0xF8) === 0xF0) return 4;   // 4-byte (11110xxx)
      return 1; // Invalid, treat as 1 byte
    };

    if (direction === 'forward') {
      while (offset < buffer.length && !isUTF8Start(buffer[offset])) {
        offset++;
      }
    } else {
      // For backward: find start of current character, then go back one more to get end of PREVIOUS character
      while (offset > 0 && !isUTF8Start(buffer[offset])) {
        offset--;
      }
      // Now offset points to start of a character - check if it's multi-byte
      if (offset >= 0 && isUTF8Start(buffer[offset])) {
        const charLen = utf8CharLen(buffer[offset]);
        if (charLen > 1 && offset + charLen - 1 >= buffer.length) {
          // Multi-byte char extends past buffer - go to previous char
          offset--;
          while (offset > 0 && !isUTF8Start(buffer[offset])) {
            offset--;
          }
          // Return end of this character
          if (offset >= 0) {
            const prevCharLen = utf8CharLen(buffer[offset]);
            offset = offset + prevCharLen - 1;
          }
        } else if (charLen > 1) {
          // Include all bytes of this multi-byte character
          offset = offset + charLen - 1;
        }
      }
    }

    return offset;
  }

  private _extractWords(chunk: CachedChunk, targetWordIndex: number, direction: 'forward' | 'backward'): Position {
    let text = chunk.text;

    // If not at the beginning AND we're mid-word, skip the partial word
    let textStart = 0;
    if (chunk.actualStart > this.boundaries.startByte && !chunk.startsAtWordBoundary) {
      const match = text.match(/^\S*\s+/);
      if (match) {
        textStart = match[0].length;
      }
    }

    // Skip any leading whitespace
    const wsMatch = text.slice(textStart).match(/^\s+/);
    if (wsMatch) {
      textStart += wsMatch[0].length;
    }

    // Calculate byte offset for textStart
    const textStartBytes = Buffer.byteLength(chunk.text.substring(0, textStart), 'utf8');

    text = text.substring(textStart);

    // Find word positions AND paragraph breaks
    const tokenPattern = /(\r?\n\s*\r?\n\s*)|(\S+)/g;
    const wordPositions: WordPosition[] = [];
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(text)) !== null) {
      const startBytes = Buffer.byteLength(text.substring(0, match.index), 'utf8');
      const tokenBytes = Buffer.byteLength(match[0], 'utf8');

      if (match[1]) {
        // Paragraph break
        wordPositions.push({
          word: '\n\n',
          isBreak: true,
          startBytes: startBytes,
          endBytes: startBytes + tokenBytes
        });
      } else {
        // Regular word
        wordPositions.push({
          word: match[2],
          isBreak: false,
          startBytes: startBytes,
          endBytes: startBytes + tokenBytes
        });
      }
    }

    if (wordPositions.length === 0) {
      const emptyPercent = ((chunk.actualStart - this.boundaries.startByte) / this.boundaries.cleanLength * 100).toFixed(1);
      return {
        words: [],
        wordIndex: targetWordIndex,
        actualCount: 0,
        percent: emptyPercent,
        isNearEnd: true,
        byteStart: chunk.actualStart + textStartBytes,
        byteEnd: chunk.actualStart + textStartBytes,
        nextByteStart: undefined,
        previousByteEnd: chunk.actualStart >= this.boundaries.startByte ? chunk.actualStart : undefined
      };
    }

    // Select tokens based on word count
    const selected: WordPosition[] = [];
    let selectedWordCount = 0;

    if (direction === 'backward') {
      for (let i = wordPositions.length - 1; i >= 0 && selectedWordCount < this.chunkSize; i--) {
        selected.unshift(wordPositions[i]);
        if (!wordPositions[i].isBreak) selectedWordCount++;
      }
    } else {
      for (let i = 0; i < wordPositions.length && selectedWordCount < this.chunkSize; i++) {
        selected.push(wordPositions[i]);
        if (!wordPositions[i].isBreak) selectedWordCount++;
      }
    }

    // Build words array
    const extractedWords = selected.filter(w => !w.isBreak).map(w => w.word);

    // Build formatted text
    const formattedText = selected.map(w => w.word).join(' ')
      .replace(/ \n\n /g, '\n\n')
      .replace(/\n\n /g, '\n\n')
      .replace(/ \n\n/g, '\n\n');

    // Calculate byte positions
    const firstToken = selected[0];
    const lastToken = selected[selected.length - 1];

    const absoluteStart = chunk.actualStart + textStartBytes + firstToken.startBytes;
    const absoluteEnd = chunk.actualStart + textStartBytes + lastToken.endBytes;

    // Calculate nextByteStart
    let nextByteStart: number | undefined;

    const lastSelectedIdx = wordPositions.indexOf(lastToken);
    if (lastSelectedIdx < wordPositions.length - 1) {
      const nextToken = wordPositions[lastSelectedIdx + 1];
      nextByteStart = chunk.actualStart + textStartBytes + nextToken.startBytes;
    } else if (absoluteEnd < this.boundaries.endByte - 100) {
      nextByteStart = absoluteEnd + 1;
    }

    const previousByteEnd = absoluteStart;

    // Update calibration
    const actualWords = wordPositions.filter(w => !w.isBreak);
    this._updateCalibration(actualWords.length, Buffer.byteLength(text, 'utf8'));

    // Calculate percent
    const percent = ((absoluteStart - this.boundaries.startByte) / this.boundaries.cleanLength * 100).toFixed(1);
    const isNearEnd = absoluteEnd >= this.boundaries.endByte - 100 ||
                      extractedWords.length < this.chunkSize;

    return {
      words: extractedWords,
      formattedText: formattedText,
      wordIndex: targetWordIndex,
      actualCount: extractedWords.length,
      percent: percent,
      isNearEnd: isNearEnd,
      nextByteStart: nextByteStart !== undefined && nextByteStart <= this.boundaries.endByte ? nextByteStart : undefined,
      previousByteEnd: previousByteEnd >= this.boundaries.startByte ? previousByteEnd : undefined,
      byteStart: absoluteStart,
      byteEnd: absoluteEnd
    };
  }

  private _updateCalibration(wordCount: number, byteCount: number): void {
    if (this.calibrationSamples.length >= this.maxCalibrationSamples) {
      this.calibrationSamples.shift();
    }

    const density = wordCount / byteCount;
    this.calibrationSamples.push(density);

    const avgDensity = this.calibrationSamples.reduce((a, b) => a + b, 0) /
                       this.calibrationSamples.length;
    this.avgBytesPerWord = 1 / avgDensity;
  }

  // Cache management
  private _getCacheKey(start: number, end: number): string {
    return `${start}-${end}`;
  }

  private _getFromCache(key: string): CachedChunk | null {
    if (this.chunkCache.has(key)) {
      this.cacheLRU = this.cacheLRU.filter(k => k !== key);
      this.cacheLRU.unshift(key);
      return this.chunkCache.get(key)!;
    }
    return null;
  }

  private _addToCache(key: string, chunk: CachedChunk): void {
    if (this.chunkCache.size >= this.maxCacheSize && !this.chunkCache.has(key)) {
      const evictKey = this.cacheLRU.pop()!;
      this.chunkCache.delete(evictKey);
    }

    this.chunkCache.set(key, chunk);
    this.cacheLRU.unshift(key);
  }

  private _prefetchAdjacent(byteStart: number, byteEnd: number, direction: 'forward' | 'backward'): void {
    const chunkSize = byteEnd - byteStart;

    if (direction === 'forward') {
      const nextStart = byteEnd + 1;
      const nextEnd = Math.min(this.boundaries.endByte, nextStart + chunkSize);
      if (nextStart <= this.boundaries.endByte) {
        setTimeout(() => {
          this._fetchRangeSafe(nextStart, nextEnd).catch(() => {});
        }, 10);
      }

      const prevEnd = byteStart - 1;
      const prevStart = Math.max(this.boundaries.startByte, prevEnd - chunkSize);
      if (prevEnd >= this.boundaries.startByte) {
        setTimeout(() => {
          this._fetchRangeSafe(prevStart, prevEnd).catch(() => {});
        }, 100);
      }
    } else {
      const prevEnd = byteStart - 1;
      const prevStart = Math.max(this.boundaries.startByte, prevEnd - chunkSize);
      if (prevEnd >= this.boundaries.startByte) {
        setTimeout(() => {
          this._fetchRangeSafe(prevStart, prevEnd).catch(() => {});
        }, 10);
      }

      const nextStart = byteEnd + 1;
      const nextEnd = Math.min(this.boundaries.endByte, nextStart + chunkSize);
      if (nextStart <= this.boundaries.endByte) {
        setTimeout(() => {
          this._fetchRangeSafe(nextStart, nextEnd).catch(() => {});
        }, 100);
      }
    }
  }
}
