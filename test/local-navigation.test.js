import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';

// Mock Fetcher that works with local file
class MockFetcher {
  constructor(content) {
    this.content = content;
    this.totalBytes = Buffer.byteLength(content, 'utf8');
    this.requestCount = 0;
    this.requestLog = [];
  }

  async getFileSize() {
    return this.totalBytes;
  }

  async fetchRange(startByte, endByte) {
    this.requestCount++;
    this.requestLog.push({ start: startByte, end: endByte, size: endByte - startByte + 1 });
    
    // Simulate HTTP Range behavior (inclusive)
    const buffer = Buffer.from(this.content, 'utf8');
    const slice = buffer.slice(startByte, endByte + 1);
    return slice.toString('utf8');
  }

  resetStats() {
    this.requestCount = 0;
    this.requestLog = [];
  }
}

// Mock Cleaner
const MockCleaner = {
  countWords(text) {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  },
  
  async findCleanBoundaries(fetcher) {
    const totalBytes = await fetcher.getFileSize();
    return {
      startByte: 0,
      endByte: totalBytes - 1,
      cleanLength: totalBytes
    };
  }
};

describe('Navigation Logic Tests', () => {
  
  it('should navigate with minimal HTTP requests', async () => {
    // Create a test document with known word count
    const words = [];
    for (let i = 0; i < 1000; i++) {
      words.push(`word${i}`);
    }
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries = await MockCleaner.findCleanBoundaries(fetcher);
    
    // Import Navigator dynamically to use our mocks
    const { Navigator } = await import('../lib/navigator.js');
    
    // Replace Cleaner.countWords temporarily
    const originalCountWords = (await import('../lib/cleaner.js')).Cleaner.countWords;
    (await import('../lib/cleaner.js')).Cleaner.countWords = MockCleaner.countWords;
    
    const navigator = new Navigator(fetcher, boundaries, 10);
    
    // Navigate to 50%
    fetcher.resetStats();
    const pos50 = await navigator.goToPercent(50);
    const requestsFor50 = fetcher.requestCount;
    
    console.log(`Requests to navigate to 50%: ${requestsFor50}`);
    console.log(`Request log:`, fetcher.requestLog);
    
    assert.ok(requestsFor50 <= 5, `Should use at most 5 requests for initial navigation (used ${requestsFor50})`);
    assert.ok(pos50.words.length > 0, 'Should return words');
    
    // Navigate forward 10 times
    fetcher.resetStats();
    let position = pos50;
    for (let i = 0; i < 10; i++) {
      position = await navigator.moveForward(position);
    }
    const requestsForForward = fetcher.requestCount;
    
    console.log(`Requests for 10 forward movements: ${requestsForForward}`);
    
    assert.ok(requestsForForward <= 15, `Should use at most 15 requests for 10 forward movements (used ${requestsForForward})`);
    
    // Navigate backward
    fetcher.resetStats();
    position = await navigator.moveBackward(position);
    const requestsForBackward = fetcher.requestCount;
    
    console.log(`Requests for 1 backward movement: ${requestsForBackward}`);
    
    assert.ok(requestsForBackward <= 2, `Should use at most 2 requests for backward movement (used ${requestsForBackward})`);
    
    // Restore original
    (await import('../lib/cleaner.js')).Cleaner.countWords = originalCountWords;
  });

  it('should handle word boundaries correctly', async () => {
    const content = 'one two three four five six seven eight nine ten ' +
                   'eleven twelve thirteen fourteen fifteen sixteen ' +
                   'seventeen eighteen nineteen twenty';
    
    const fetcher = new MockFetcher(content);
    const boundaries = await MockCleaner.findCleanBoundaries(fetcher);
    
    const { Navigator } = await import('../lib/navigator.js');
    const navigator = new Navigator(fetcher, boundaries, 5);
    
    // Get first chunk
    const pos1 = await navigator.goToPercent(0);
    assert.strictEqual(pos1.actualCount, 5, 'Should get 5 words');
    assert.strictEqual(pos1.words[0], 'one', 'First word should be "one"');
    assert.strictEqual(pos1.words[4], 'five', 'Fifth word should be "five"');
  });

  it('should track positions accurately across movements', async () => {
    const words = [];
    for (let i = 1; i <= 100; i++) {
      words.push(`word${i}`);
    }
    const content = words.join(' ');
    
    const fetcher = new MockFetcher(content);
    const boundaries = await MockCleaner.findCleanBoundaries(fetcher);
    
    const { Navigator } = await import('../lib/navigator.js');
    const navigator = new Navigator(fetcher, boundaries, 10);
    
    // Start at beginning
    let position = await navigator.goToPercent(0);
    assert.strictEqual(position.wordIndex, 0, 'Should start at word 0');
    
    // Move forward twice
    position = await navigator.moveForward(position);
    assert.strictEqual(position.wordIndex, 10, 'Should be at word 10');
    
    position = await navigator.moveForward(position);
    assert.strictEqual(position.wordIndex, 20, 'Should be at word 20');
    
    // Move backward once
    position = await navigator.moveBackward(position);
    assert.strictEqual(position.wordIndex, 10, 'Should be back at word 10');
  });

  it('should not fetch more than necessary bytes', async () => {
    const words = [];
    for (let i = 0; i < 10000; i++) {
      words.push(`word${i}`);
    }
    const content = words.join(' ');
    const totalBytes = Buffer.byteLength(content, 'utf8');
    
    const fetcher = new MockFetcher(content);
    const boundaries = await MockCleaner.findCleanBoundaries(fetcher);
    
    const { Navigator } = await import('../lib/navigator.js');
    const navigator = new Navigator(fetcher, boundaries, 10);
    
    // Navigate to 80%
    fetcher.resetStats();
    await navigator.goToPercent(80);
    
    const totalBytesRequested = fetcher.requestLog.reduce((sum, req) => sum + req.size, 0);
    const percentageDownloaded = (totalBytesRequested / totalBytes) * 100;
    
    console.log(`Total bytes: ${totalBytes}`);
    console.log(`Bytes requested: ${totalBytesRequested}`);
    console.log(`Percentage downloaded: ${percentageDownloaded.toFixed(2)}%`);
    
    assert.ok(percentageDownloaded < 10, `Should download less than 10% of file (downloaded ${percentageDownloaded.toFixed(2)}%)`);
  });
});
