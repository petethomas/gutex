import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Display } from '../src/display.js';
import type { Position, FetcherStats } from '../src/types.js';

// Strip ANSI codes for test comparisons (handles colors, cursor, screen control)
function stripAnsi(str: string): string {
  // Match all ANSI escape sequences: colors (\x1b[...m), cursor (\x1b[...H), screen (\x1b[...J), etc.
  return str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
}

describe('Display', () => {
  let originalLog: typeof console.log;
  let originalClear: typeof console.clear;
  let originalWrite: typeof process.stdout.write;
  let logOutput: string[];
  let clearCalled: boolean;
  
  beforeEach(() => {
    // Capture console output
    logOutput = [];
    clearCalled = false;
    
    originalLog = console.log;
    originalClear = console.clear;
    originalWrite = process.stdout.write.bind(process.stdout);
    
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(a => String(a)).join(' '));
    };
    
    console.clear = () => {
      clearCalled = true;
    };
    
    // Also capture process.stdout.write for ANSI sequences
    process.stdout.write = (data: string | Uint8Array) => {
      if (typeof data === 'string') {
        // Don't capture pure ANSI sequences, only content
        const stripped = stripAnsi(data);
        if (stripped.trim()) {
          logOutput.push(stripped);
        }
      }
      return true;
    };
  });
  
  afterEach(() => {
    console.log = originalLog;
    console.clear = originalClear;
    process.stdout.write = originalWrite;
  });
  
  describe('render with chrome (default)', () => {
    it('should display metadata and navigation help', () => {
      const display = new Display({ bookId: 996 });
      const position: Position = {
        words: ['put', 'down', 'all', 'he', 'meant', 'to', 'say,'],
        wordIndex: 154500,
        actualCount: 7,
        percent: '36.0',
        byteStart: 0,
        byteEnd: 100,
        isNearEnd: false
      };
      
      display.render(position);
      
      assert.strictEqual(clearCalled, true);
      
      const output = stripAnsi(logOutput.join('\n'));
      assert.ok(output.includes('[Book 996]'), 'should include book ID');
      assert.ok(output.includes('Words 154500-154506'), 'should include word range');
      assert.ok(output.includes('36.0%'), 'should include percent');
      assert.ok(output.includes('put down all he meant to say,'), 'should include text');
      assert.ok(output.includes('nav') || output.includes('navigate'), 'should include navigation hint');
    });
    
    it('should calculate word range correctly', () => {
      const display = new Display({ bookId: 1234 });
      const position: Position = {
        words: ['test'],
        wordIndex: 100,
        actualCount: 1,
        percent: '5.0',
        byteStart: 0,
        byteEnd: 100,
        isNearEnd: false
      };
      
      display.render(position);
      
      const output = stripAnsi(logOutput.join('\n'));
      assert.ok(output.includes('Words 100-100'), 'should include single word range');
    });
    
    it('should handle multi-word ranges', () => {
      const display = new Display({ bookId: 500 });
      const position: Position = {
        words: ['one', 'two', 'three', 'four', 'five'],
        wordIndex: 1000,
        actualCount: 5,
        percent: '50.0',
        byteStart: 0,
        byteEnd: 100,
        isNearEnd: false
      };
      
      display.render(position);
      
      const output = stripAnsi(logOutput.join('\n'));
      assert.ok(output.includes('Words 1000-1004'), 'should include multi-word range');
    });
  });
  
  describe('render without chrome (--raw mode)', () => {
    it('should display only words without metadata', () => {
      const display = new Display({ bookId: 996, showChrome: false });
      const position: Position = {
        words: ['put', 'down', 'all', 'he', 'meant', 'to', 'say,'],
        wordIndex: 154500,
        actualCount: 7,
        percent: '36.0',
        byteStart: 0,
        byteEnd: 100,
        isNearEnd: false
      };
      
      display.render(position);
      
      assert.strictEqual(clearCalled, true);
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('put down all he meant to say,'));
      assert.ok(!output.includes('[Book 996]'));
      assert.ok(!output.includes('[Words'));
      assert.ok(!output.includes('%]'));
      assert.ok(!output.includes('navigate'));
      assert.ok(!output.includes('quit'));
    });
    
    it('should only output the text content', () => {
      const display = new Display({ bookId: 123, showChrome: false });
      const position: Position = {
        words: ['simple', 'test'],
        wordIndex: 0,
        actualCount: 2,
        percent: '0.0',
        byteStart: 0,
        byteEnd: 100,
        isNearEnd: false
      };
      
      display.render(position);
      
      assert.strictEqual(logOutput.length, 1);
      assert.strictEqual(logOutput[0], 'simple test');
    });
  });
  
  describe('printSnapshot (static method)', () => {
    it('should print only words without clearing screen', () => {
      clearCalled = false;
      
      const position: Position = {
        words: ['put', 'down', 'all', 'he', 'meant', 'to', 'say,'],
        wordIndex: 154500,
        actualCount: 7,
        percent: '36.0',
        byteStart: 0,
        byteEnd: 100,
        isNearEnd: false
      };
      
      Display.printSnapshot(position);
      
      assert.strictEqual(clearCalled, false); // Should NOT clear in snapshot mode
      assert.strictEqual(logOutput.length, 1);
      assert.strictEqual(logOutput[0], 'put down all he meant to say,');
    });
    
    it('should work with single word', () => {
      const position: Position = {
        words: ['word'],
        wordIndex: 0,
        actualCount: 1,
        percent: '0.0',
        byteStart: 0,
        byteEnd: 100,
        isNearEnd: false
      };
      
      Display.printSnapshot(position);
      
      assert.strictEqual(logOutput[0], 'word');
    });
  });
  
  describe('showLoading', () => {
    it('should show loading message with chrome', () => {
      const display = new Display({ bookId: 996, showChrome: true });
      
      display.showLoading(996);
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('Loading book 996'));
    });
    
    it('should not show loading message without chrome', () => {
      const display = new Display({ bookId: 996, showChrome: false });
      
      display.showLoading(996);
      
      assert.strictEqual(logOutput.length, 0);
    });
  });
  
  describe('showGoodbye', () => {
    it('should show goodbye with chrome', () => {
      const display = new Display({ bookId: 996, showChrome: true });
      
      display.showGoodbye();
      
      assert.strictEqual(clearCalled, true);
      const output = logOutput.join('\n');
      assert.ok(output.includes('Thanks for using Gutex'));
    });
    
    it('should not show goodbye without chrome', () => {
      const display = new Display({ bookId: 996, showChrome: false });
      
      display.showGoodbye();
      
      assert.strictEqual(logOutput.length, 0);
    });
  });
  
  describe('showStats', () => {
    it('should show stats with chrome', () => {
      const display = new Display({ bookId: 996, showChrome: true });
      const stats: FetcherStats = {
        requests: 5,
        bytesDownloaded: 12345,
        totalBytes: 100000,
        efficiency: '12.3%',
        mirror: 'test-mirror'
      };
      
      display.showStats(stats);
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('Session Statistics'));
      assert.ok(output.includes('HTTP Requests: 5'));
      assert.ok(output.includes('12,345')); // Formatted number
      assert.ok(output.includes('12.3%'));
    });
    
    it('should not show stats without chrome', () => {
      const display = new Display({ bookId: 996, showChrome: false });
      const stats: FetcherStats = {
        requests: 5,
        bytesDownloaded: 12345,
        totalBytes: 100000,
        efficiency: '12.3%',
        mirror: 'test-mirror'
      };
      
      display.showStats(stats);
      
      assert.strictEqual(logOutput.length, 0);
    });
  });
  
  describe('showEndOfBook', () => {
    it('should always show end of book prompt', () => {
      // End of book should show even without chrome
      const display = new Display({ bookId: 996, showChrome: false });
      
      display.showEndOfBook(996);
      
      assert.strictEqual(clearCalled, true);
      const output = logOutput.join('\n');
      assert.ok(output.includes('reached the end'));
      assert.ok(output.includes('book 997'));
      assert.ok(output.includes('book 995'));
    });
  });
});
