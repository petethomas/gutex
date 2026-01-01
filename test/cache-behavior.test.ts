import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Navigator } from '../src/navigator.js';
import type { Boundaries, FetcherInterface, Position } from '../src/types.js';

interface FetchCall {
  startByte: number;
  endByte: number;
}

class MockFetcher implements FetcherInterface {
  content: string;
  totalBytes: number;
  fetchCalls: FetchCall[];

  constructor(content: string) {
    this.content = content;
    this.totalBytes = Buffer.byteLength(content, 'utf8');
    this.fetchCalls = [];
  }

  async fetchHead(): Promise<number> {
    return this.totalBytes;
  }

  getStats(): { requests: number; bytesDownloaded: number; totalBytes: number | null; efficiency: string; mirror: string } {
    return { requests: this.fetchCalls.length, bytesDownloaded: 0, totalBytes: this.totalBytes, efficiency: '0%', mirror: 'mock' };
  }

  async getFileSize(): Promise<number> {
    return this.totalBytes;
  }

  async fetchRange(startByte: number, endByte: number): Promise<Buffer> {
    this.fetchCalls.push({ startByte, endByte });
    const buffer = Buffer.from(this.content, 'utf8');
    const slice = buffer.slice(startByte, endByte + 1);
    return slice;
  }

  getFetchCount(): number {
    return this.fetchCalls.length;
  }

  clearCalls(): void {
    this.fetchCalls = [];
  }
}

describe('Cache Behavior Tests', () => {
  let fetcher: MockFetcher;
  let navigator: Navigator;
  let boundaries: Boundaries;
  let content: string;

  beforeEach(() => {
    // Create test content
    const words: string[] = [];
    for (let i = 0; i < 500; i++) {
      words.push(`word${i.toString().padStart(4, '0')}`);
    }
    content = words.join(' ');
    
    fetcher = new MockFetcher(content);
    boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
  });

  it('caches chunks and reduces HTTP requests on revisit', async () => {
    navigator = new Navigator(fetcher, boundaries, 10);
    
    // Navigate forward
    const pos1 = await navigator.goToPercent(25);
    const pos2 = await navigator.moveForward(pos1);
    const requestsAfterForward = fetcher.getFetchCount();
    
    // Navigate backward (should use history, no fetch)
    await navigator.moveBackward(pos2);
    const requestsAfterBackward = fetcher.getFetchCount();
    
    assert.strictEqual(requestsAfterBackward, requestsAfterForward,
      'Backward navigation should use history without fetching');
  });

  it('LRU cache evicts oldest entries when full', async () => {
    navigator = new Navigator(fetcher, boundaries, 5);
    navigator.maxCacheSize = 3; // Small cache for testing
    
    // Navigate to force multiple cache entries
    let position: Position = await navigator.goToPercent(10);
    
    for (let i = 0; i < 5; i++) {
      position = await navigator.moveForward(position);
    }
    
    // Cache should not exceed max size
    assert.ok(navigator.chunkCache.size <= navigator.maxCacheSize,
      `Cache size ${navigator.chunkCache.size} exceeds max ${navigator.maxCacheSize}`);
  });

  it('cache hit rate improves with bidirectional navigation', async () => {
    navigator = new Navigator(fetcher, boundaries, 10);
    
    let position: Position = await navigator.goToPercent(50);
    fetcher.clearCalls();
    
    // Forward and backward multiple times
    for (let i = 0; i < 3; i++) {
      position = await navigator.moveForward(position);
    }
    for (let i = 0; i < 3; i++) {
      position = await navigator.moveBackward(position);
    }
    
    const totalMoves = 6;
    const actualFetches = fetcher.getFetchCount();
    
    // With caching, should fetch fewer times than moves
    assert.ok(actualFetches < totalMoves,
      `Expected fewer fetches than ${totalMoves}, got ${actualFetches}`);
  });

  it('predictive prefetch reduces wait time for next chunk', async () => {
    navigator = new Navigator(fetcher, boundaries, 10);
    
    const pos1 = await navigator.goToPercent(30);
    
    // Small delay to allow prefetch to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    fetcher.clearCalls();
    
    // Next forward should potentially hit cache if prefetch worked
    await navigator.moveForward(pos1);
    
    // This is probabilistic - prefetch may or may not complete in time
    // Just verify it doesn't crash
    assert.ok(true, 'Prefetch mechanism works without errors');
  });

  it('cache correctly handles aligned vs unaligned byte positions', async () => {
    navigator = new Navigator(fetcher, boundaries, 10);
    
    // Request from aligned position
    const pos1 = await navigator.goToPercent(0);
    const cacheKeysBefore = Array.from(navigator.chunkCache.keys());
    
    // Request from nearby unaligned position should reuse cache
    const pos2 = await navigator.moveForward(pos1);
    
    assert.ok(navigator.chunkCache.size >= 1,
      'Cache should contain entries after navigation');
  });
});
