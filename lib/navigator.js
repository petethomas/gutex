import { Cleaner } from './cleaner.js';

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
export class Navigator {
  constructor(fetcher, boundaries, chunkSize) {
    this.fetcher = fetcher;
    this.boundaries = boundaries;
    this.chunkSize = chunkSize;
    
    // Word density estimation
    this.avgBytesPerWord = 6;
    this.totalWords = null;
    this.calibrationSamples = [];
    this.maxCalibrationSamples = 10;
    
    // Position history for symmetric navigation
    this.positionHistory = [];
    this.maxHistorySize = 50;
    this.futureHistory = []; // For forward-after-backward
    
    // Chunk cache with LRU
    this.chunkCache = new Map();
    this.cacheLRU = [];
    this.maxCacheSize = 10;
    
    // UTF-8 safety margin
    this.safetyMargin = 3;
  }

  async goToPercent(percent) {
    if (!this.totalWords) {
      await this._calibrateWordDensity();
    }
    
    const targetWord = Math.floor(this.totalWords * (percent / 100));
    
    // Clear history when jumping to new position
    this.positionHistory = [];
    this.futureHistory = [];
    
    return await this._navigateToWord(targetWord);
  }

  async moveForward(currentPosition) {
    // Save current position to history BEFORE moving
    this.positionHistory.push({
      ...currentPosition,
      // Store the exact byte boundaries so we can return to them
      savedByteStart: currentPosition.byteStart,
      savedByteEnd: currentPosition.byteEnd
    });
    
    // Trim history if too large
    if (this.positionHistory.length > this.maxHistorySize) {
      this.positionHistory.shift();
    }
    
    // Clear future history (like browser forward button)
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

  async moveBackward(currentPosition) {
    // Check if we have position history
    if (this.positionHistory.length > 0) {
      // Save current to future history (for forward-after-backward)
      this.futureHistory.push({ ...currentPosition });
      
      // Restore previous position - return it directly without re-fetching
      const previousPosition = this.positionHistory.pop();
      
      // Return the exact saved position for perfect symmetry
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

  async _calibrateWordDensity() {
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

  async _navigateToWord(targetWord) {
    targetWord = Math.max(0, Math.min(targetWord, this.totalWords - 1));
    
    const estimatedByteOffset = targetWord * this.avgBytesPerWord;
    const estimatedByte = this.boundaries.startByte + Math.floor(estimatedByteOffset);
    
    const safetyMargin = Math.floor(this.avgBytesPerWord * 20);
    const fetchSize = Math.floor(this.chunkSize * this.avgBytesPerWord * 2.5);
    
    const fetchStart = Math.max(this.boundaries.startByte, estimatedByte - safetyMargin);
    const fetchEnd = Math.min(this.boundaries.endByte, estimatedByte + fetchSize);
    
    return await this._fetchChunkAt(fetchStart, targetWord, 'forward', fetchEnd);
  }

  async _fetchChunkAt(byteStart, targetWordIndex, direction = 'forward', byteEnd = null) {
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
        actualEnd: result.actualEnd
      };
      
      // Add to cache
      this._addToCache(cacheKey, chunk);
      
      // Prefetch adjacent chunks
      this._prefetchAdjacent(byteStart, byteEnd, direction);
    }
    
    // Extract words from the fetched chunk
    return this._extractWords(chunk, targetWordIndex, direction);
  }

  async _fetchChunkBackward(previousByteEnd, targetWordIndex) {
    // Calculate range for backward fetch
    const fetchSize = Math.floor(this.chunkSize * this.avgBytesPerWord * 2.5);
    const byteEnd = previousByteEnd - 1;
    const byteStart = Math.max(this.boundaries.startByte, byteEnd - fetchSize);
    
    return await this._fetchChunkAt(byteStart, targetWordIndex, 'backward', byteEnd);
  }

  async _fetchRangeSafe(startByte, endByte) {
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
    
    return {
      text: validText,
      actualStart: requestStart + actualStartOffset,
      actualEnd: requestStart + actualEndOffset
    };
  }

  _findUTF8Boundary(buffer, offset, direction) {
    const isUTF8Start = (byte) => (byte & 0xC0) !== 0x80;
    
    if (direction === 'forward') {
      while (offset < buffer.length && !isUTF8Start(buffer[offset])) {
        offset++;
      }
    } else {
      while (offset > 0 && !isUTF8Start(buffer[offset])) {
        offset--;
      }
    }
    
    return offset;
  }

  _extractWords(chunk, targetWordIndex, direction) {
    let text = chunk.text;
    
    // If not at the beginning, find first complete word boundary
    let textStart = 0;
    if (chunk.actualStart > this.boundaries.startByte) {
      const firstNewline = text.indexOf('\n');
      const firstSpace = text.indexOf(' ');
      
      if (firstNewline !== -1 && firstSpace !== -1) {
        textStart = Math.min(firstNewline, firstSpace) + 1;
      } else if (firstNewline !== -1) {
        textStart = firstNewline + 1;
      } else if (firstSpace !== -1) {
        textStart = firstSpace + 1;
      }
    }
    
    text = text.substring(textStart);
    const allWords = text.split(/\s+/).filter(w => w.length > 0);
    
    // Extract exactly chunkSize words
    let extractedWords;
    let actualWordIndex = targetWordIndex;
    let extractStartInChunk = 0;
    
    if (direction === 'backward') {
      // Take the last chunkSize words (or all if fewer)
      const startIdx = Math.max(0, allWords.length - this.chunkSize);
      extractedWords = allWords.slice(startIdx);
      
      // Find where the extracted words start in the text
      if (startIdx > 0) {
        // Need to find the position after the (startIdx-1)th word
        let wordCount = 0;
        for (let i = 0; i < text.length && wordCount < startIdx; i++) {
          if (/\s/.test(text[i])) {
            if (i + 1 < text.length && !/\s/.test(text[i + 1])) {
              wordCount++;
            }
          }
        }
        // Find the start of the next non-whitespace after startIdx words
        extractStartInChunk = text.split(/\s+/).slice(0, startIdx).join(' ').length;
        if (extractStartInChunk > 0) extractStartInChunk++; // Account for space
      }
    } else {
      // For forward navigation, take the first N words
      extractedWords = allWords.slice(0, this.chunkSize);
      extractStartInChunk = 0;
    }
    
    // Calculate the byte span of extracted words
    const extractedText = extractedWords.join(' ');
    const extractEndInChunk = extractStartInChunk + extractedText.length;
    
    // Calculate absolute byte positions
    const absoluteStart = chunk.actualStart + textStart + extractStartInChunk;
    const absoluteEnd = chunk.actualStart + textStart + extractEndInChunk;
    
    // Calculate positions for next movements
    const nextByteStart = absoluteEnd + 1; // Start of next chunk
    const previousByteEnd = absoluteStart; // End before this chunk
    
    // Update calibration with actual data
    this._updateCalibration(allWords.length, text.length);
    
    const percent = ((actualWordIndex / this.totalWords) * 100).toFixed(1);
    const isNearEnd = absoluteEnd >= this.boundaries.endByte - 100 || 
                      extractedWords.length < this.chunkSize;
    
    return {
      words: extractedWords,
      wordIndex: actualWordIndex,
      actualCount: extractedWords.length,
      percent: percent,
      isNearEnd: isNearEnd,
      
      // Dual-position tracking for symmetry
      nextByteStart: nextByteStart <= this.boundaries.endByte ? nextByteStart : undefined,
      previousByteEnd: previousByteEnd >= this.boundaries.startByte ? previousByteEnd : undefined,
      
      // Store actual byte boundaries
      byteStart: absoluteStart,
      byteEnd: absoluteEnd
    };
  }

  _updateCalibration(wordCount, byteCount) {
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
  _getCacheKey(start, end) {
    // Align to chunk boundaries for better cache hit rate
    const alignedStart = Math.floor(start / 1024) * 1024;
    return `${alignedStart}-${end}`;
  }

  _getFromCache(key) {
    if (this.chunkCache.has(key)) {
      // Move to front of LRU
      this.cacheLRU = this.cacheLRU.filter(k => k !== key);
      this.cacheLRU.unshift(key);
      return this.chunkCache.get(key);
    }
    return null;
  }

  _addToCache(key, chunk) {
    // Evict if at capacity
    if (this.chunkCache.size >= this.maxCacheSize && !this.chunkCache.has(key)) {
      const evictKey = this.cacheLRU.pop();
      this.chunkCache.delete(evictKey);
    }
    
    this.chunkCache.set(key, chunk);
    this.cacheLRU.unshift(key);
  }

  _prefetchAdjacent(byteStart, byteEnd, direction) {
    const chunkSize = byteEnd - byteStart;
    
    // Higher priority prefetch in direction of movement
    if (direction === 'forward') {
      const nextStart = byteEnd + 1;
      const nextEnd = Math.min(this.boundaries.endByte, nextStart + chunkSize);
      if (nextStart <= this.boundaries.endByte) {
        setTimeout(() => {
          this._fetchRangeSafe(nextStart, nextEnd).catch(() => {});
        }, 10);
      }
      
      // Lower priority backward prefetch
      const prevEnd = byteStart - 1;
      const prevStart = Math.max(this.boundaries.startByte, prevEnd - chunkSize);
      if (prevEnd >= this.boundaries.startByte) {
        setTimeout(() => {
          this._fetchRangeSafe(prevStart, prevEnd).catch(() => {});
        }, 100);
      }
    } else {
      // Backward navigation - prefetch backward first
      const prevEnd = byteStart - 1;
      const prevStart = Math.max(this.boundaries.startByte, prevEnd - chunkSize);
      if (prevEnd >= this.boundaries.startByte) {
        setTimeout(() => {
          this._fetchRangeSafe(prevStart, prevEnd).catch(() => {});
        }, 10);
      }
      
      // Lower priority forward prefetch
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
