import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Navigator } from '../src/navigator.js';
import type { Boundaries, FetcherInterface, Position } from '../src/types.js';

// Mock Fetcher
class MockFetcher implements FetcherInterface {
  content: string;
  totalBytes: number;

  constructor(content: string) {
    this.content = content;
    this.totalBytes = Buffer.byteLength(content, 'utf8');
  }

  async fetchHead(): Promise<number> {
    return this.totalBytes;
  }

  getStats(): { requests: number; bytesDownloaded: number; totalBytes: number | null; efficiency: string; mirror: string } {
    return { requests: 0, bytesDownloaded: 0, totalBytes: this.totalBytes, efficiency: '0%', mirror: 'mock' };
  }

  async getFileSize(): Promise<number> {
    return this.totalBytes;
  }

  async fetchRange(startByte: number, endByte: number): Promise<Buffer> {
    const buffer = Buffer.from(this.content, 'utf8');
    const slice = buffer.slice(startByte, endByte + 1);
    return slice;
  }
}

describe('Fixed Backward Navigation Tests', () => {
  
  it('backward navigation returns full chunkSize words (not just 1-2)', async () => {
    const words: string[] = [];
    for (let i = 0; i < 100; i++) {
      words.push(`word${i.toString().padStart(3, '0')}`);
    }
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const chunkSize = 10;
    const navigator = new Navigator(fetcher, boundaries, chunkSize);
    
    // Navigate to middle
    let position: Position = await navigator.goToPercent(50);
    
    // Move forward
    position = await navigator.moveForward(position);
    
    // Move backward
    position = await navigator.moveBackward(position);
    
    // Verify we get the full chunkSize
    assert.strictEqual(position.actualCount, chunkSize,
      `Should return ${chunkSize} words, got ${position.actualCount}`);
    assert.strictEqual(position.words.length, chunkSize,
      `Words array should have ${chunkSize} elements, has ${position.words.length}`);
    
    // Verify no word fragments
    for (const word of position.words) {
      assert.ok(word.startsWith('word'), `Word "${word}" should be complete, not a fragment`);
      assert.ok(word.length >= 7, `Word "${word}" should not be truncated`);
    }
  });

  it('backward navigation moves the same distance as forward', async () => {
    const words: string[] = [];
    for (let i = 0; i < 200; i++) {
      words.push(`W${i}`);
    }
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const chunkSize = 7;
    const navigator = new Navigator(fetcher, boundaries, chunkSize);
    
    // Start at a known position
    let position: Position = await navigator.goToPercent(50);
    const startIndex = position.wordIndex;
    
    // Move forward
    position = await navigator.moveForward(position);
    const forwardDistance = position.wordIndex - startIndex;
    
    // Move backward
    position = await navigator.moveBackward(position);
    const finalIndex = position.wordIndex;
    
    // Should be back at starting position
    assert.strictEqual(finalIndex, startIndex,
      `Should return to starting position ${startIndex}, got ${finalIndex}`);
    
    // Forward and backward should move same distance
    assert.strictEqual(forwardDistance, chunkSize,
      `Forward should move ${chunkSize} words, moved ${forwardDistance}`);
  });

  it('multiple backward movements work correctly', async () => {
    const words: string[] = [];
    for (let i = 0; i < 100; i++) {
      words.push(`WORD_${i}`);
    }
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const chunkSize = 5;
    const navigator = new Navigator(fetcher, boundaries, chunkSize);
    
    // Start at 80%
    let position: Position = await navigator.goToPercent(80);
    
    // Move backward 5 times
    for (let i = 0; i < 5; i++) {
      const prevIndex = position.wordIndex;
      position = await navigator.moveBackward(position);
      
      // Each backward move should return full chunkSize words
      assert.strictEqual(position.actualCount, chunkSize,
        `Backward move ${i+1}: should return ${chunkSize} words, got ${position.actualCount}`);
      
      // Should move backward by chunkSize words (approximately, due to rounding)
      const distance = prevIndex - position.wordIndex;
      assert.ok(distance >= chunkSize - 1 && distance <= chunkSize + 1,
        `Backward move ${i+1}: should move ~${chunkSize} words, moved ${distance}`);
    }
  });

  it('backward and forward movements are symmetric', async () => {
    const words: string[] = [];
    for (let i = 0; i < 150; i++) {
      words.push(`W${i.toString().padStart(3, '0')}`);
    }
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const chunkSize = 8;
    const navigator = new Navigator(fetcher, boundaries, chunkSize);
    
    // Start at 40%
    let position: Position = await navigator.goToPercent(40);
    const initialIndex = position.wordIndex;
    
    // Forward 3, backward 3
    for (let i = 0; i < 3; i++) {
      position = await navigator.moveForward(position);
    }
    for (let i = 0; i < 3; i++) {
      position = await navigator.moveBackward(position);
    }
    
    // Should be close to initial position (within rounding error)
    const diff = Math.abs(position.wordIndex - initialIndex);
    assert.ok(diff <= 2,
      `Should return close to initial position ${initialIndex}, got ${position.wordIndex} (diff: ${diff})`);
    
    // All movements should have returned full chunks
    assert.strictEqual(position.actualCount, chunkSize,
      `Final position should show ${chunkSize} words, shows ${position.actualCount}`);
  });

  it('backward at start of document does not crash', async () => {
    const words: string[] = [];
    for (let i = 0; i < 50; i++) {
      words.push(`W${i}`);
    }
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const chunkSize = 5;
    const navigator = new Navigator(fetcher, boundaries, chunkSize);
    
    // Navigate to start
    let position: Position = await navigator.goToPercent(0);
    
    // Move backward from start - should not crash
    position = await navigator.moveBackward(position);
    
    // Should still return valid words
    assert.ok(position.words.length > 0, 'Should return words even at start');
    assert.strictEqual(position.wordIndex, 0, 'Should stay at word 0');
  });
});
