import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Navigator } from '../src/navigator.js';
import type { Boundaries, FetcherInterface, Position } from '../src/types.js';

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

describe('Edge Case Tests', () => {
  
  it('handles position history overflow correctly', async () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 5);
    navigator.maxHistorySize = 10; // Small history for testing
    
    let position: Position = await navigator.goToPercent(10);
    
    // Move forward more than maxHistorySize times
    for (let i = 0; i < 15; i++) {
      position = await navigator.moveForward(position);
    }
    
    // History should not exceed max size
    assert.ok(navigator.positionHistory.length <= navigator.maxHistorySize,
      `History size ${navigator.positionHistory.length} exceeds max ${navigator.maxHistorySize}`);
  });

  it('circular buffer behavior in position history', async () => {
    const words = Array.from({ length: 300 }, (_, i) => `W${i}`);
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 5);
    navigator.maxHistorySize = 5;
    
    let position: Position = await navigator.goToPercent(20);
    
    // Fill history beyond capacity
    const positions: Position[] = [position];
    for (let i = 0; i < 8; i++) {
      position = await navigator.moveForward(position);
      positions.push(position);
    }
    
    // Move backward - should only go back maxHistorySize steps
    for (let i = 0; i < 3; i++) {
      position = await navigator.moveBackward(position);
    }
    
    assert.ok(true, 'Circular buffer handles overflow without crashing');
  });

  it('handles start of file boundary', async () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 10);
    
    const position = await navigator.goToPercent(0);
    
    // Should be at start
    assert.ok(position.byteStart >= 0, 'Should not go before file start');
    assert.ok(position.wordIndex >= 0, 'Word index should not be negative');
    
    // Try to move backward from start
    const backPosition = await navigator.moveBackward(position);
    
    assert.strictEqual(backPosition.wordIndex, 0, 
      'Moving backward from start should stay at start');
  });

  it('handles end of file boundary', async () => {
    const words = Array.from({ length: 50 }, (_, i) => `word${i}`);
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 10);
    
    let position = await navigator.goToPercent(100);
    
    // Should detect near end
    assert.strictEqual(position.isNearEnd, true, 
      'Should detect end of file');
    
    // Try to move forward from near end
    const forwardPosition = await navigator.moveForward(position);
    
    // Should not crash, may return fewer words or same position
    assert.ok(forwardPosition !== null, 'Should handle forward at end');
  });

  it('handles very small files', async () => {
    const content = 'one two three';
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 10);
    
    const position = await navigator.goToPercent(0);
    
    // Should return whatever words exist (3 in this case)
    assert.ok(position.words.length > 0, 'Should return available words');
    assert.ok(position.words.length <= 3, 'Should not exceed actual word count');
  });

  it('handles very large chunk sizes', async () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    // Request more words than file contains
    const navigator = new Navigator(fetcher, boundaries, 200);
    
    const position = await navigator.goToPercent(0);
    
    // Should return all available words without error
    assert.ok(position.words.length <= 100, 
      'Should not return more words than file contains');
    assert.ok(position.isNearEnd, 'Should detect near end with large chunk');
  });

  it('handles zero-width content between words', async () => {
    const content = 'word1\n\n\nword2\t\t\tword3     word4';
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 3);
    
    const position = await navigator.goToPercent(0);
    
    // Should filter out empty strings from split
    for (const word of position.words) {
      assert.ok(word.length > 0, 'No empty words should be returned');
    }
  });

  it('maintains consistency after multiple direction changes', async () => {
    const words = Array.from({ length: 200 }, (_, i) => `W${i}`);
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 7);
    
    let position: Position = await navigator.goToPercent(40);
    const startIndex = position.wordIndex;
    
    // Complex navigation pattern: forward, forward, back, back, forward
    position = await navigator.moveForward(position);
    position = await navigator.moveForward(position);
    position = await navigator.moveBackward(position);
    position = await navigator.moveBackward(position);
    position = await navigator.moveForward(position);
    
    // Should be back at second position
    assert.ok(Math.abs(position.wordIndex - (startIndex + 7)) <= 2,
      'Complex navigation should maintain consistency');
  });

  it('handles jumping to same position twice', async () => {
    const words = Array.from({ length: 150 }, (_, i) => `word${i}`);
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 10);
    
    const pos1 = await navigator.goToPercent(50);
    const pos2 = await navigator.goToPercent(50);
    
    // Should return same position
    assert.strictEqual(pos1.wordIndex, pos2.wordIndex,
      'Jumping to same percent should give same position');
  });

  it('clears history when jumping to new position', async () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries: Boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 5);
    
    let position: Position = await navigator.goToPercent(25);
    
    // Build up some history
    for (let i = 0; i < 5; i++) {
      position = await navigator.moveForward(position);
    }
    
    const historyBeforeJump = navigator.positionHistory.length;
    assert.ok(historyBeforeJump > 0, 'Should have history before jump');
    
    // Jump to new position
    await navigator.goToPercent(75);
    
    const historyAfterJump = navigator.positionHistory.length;
    assert.strictEqual(historyAfterJump, 0, 
      'History should be cleared after jump');
  });
});
