import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Display } from '../lib/display.js';

describe('Display', () => {
  let originalLog;
  let originalClear;
  let logOutput;
  let clearCalled;
  
  beforeEach(() => {
    // Capture console output
    logOutput = [];
    clearCalled = false;
    
    originalLog = console.log;
    originalClear = console.clear;
    
    console.log = (...args) => {
      logOutput.push(args.join(' '));
    };
    
    console.clear = () => {
      clearCalled = true;
    };
  });
  
  afterEach(() => {
    console.log = originalLog;
    console.clear = originalClear;
  });
  
  describe('render with chrome (default)', () => {
    it('should display metadata and navigation help', () => {
      const display = new Display({ bookId: 996 });
      const position = {
        words: ['put', 'down', 'all', 'he', 'meant', 'to', 'say,'],
        wordIndex: 154500,
        actualCount: 7,
        percent: '36.0'
      };
      
      display.render(position);
      
      assert.strictEqual(clearCalled, true);
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('[Book 996]'));
      assert.ok(output.includes('[Words 154500-154506]'));
      assert.ok(output.includes('[36.0%]'));
      assert.ok(output.includes('put down all he meant to say,'));
      assert.ok(output.includes('[←↓as ↑→wd to navigate | q to quit]'));
    });
    
    it('should calculate word range correctly', () => {
      const display = new Display({ bookId: 1234 });
      const position = {
        words: ['test'],
        wordIndex: 100,
        actualCount: 1,
        percent: '5.0'
      };
      
      display.render(position);
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('[Words 100-100]')); // Single word
    });
    
    it('should handle multi-word ranges', () => {
      const display = new Display({ bookId: 500 });
      const position = {
        words: ['one', 'two', 'three', 'four', 'five'],
        wordIndex: 1000,
        actualCount: 5,
        percent: '50.0'
      };
      
      display.render(position);
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('[Words 1000-1004]'));
    });
  });
  
  describe('render without chrome (--raow mode)', () => {
    it('should display only words without metadata', () => {
      const display = new Display({ bookId: 996, showChrome: false });
      const position = {
        words: ['put', 'down', 'all', 'he', 'meant', 'to', 'say,'],
        wordIndex: 154500,
        actualCount: 7,
        percent: '36.0'
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
      const position = {
        words: ['simple', 'test'],
        wordIndex: 0,
        actualCount: 2,
        percent: '0.0'
      };
      
      display.render(position);
      
      assert.strictEqual(logOutput.length, 1);
      assert.strictEqual(logOutput[0], 'simple test');
    });
  });
  
  describe('printSnapshot (static method)', () => {
    it('should print only words without clearing screen', () => {
      clearCalled = false;
      
      const position = {
        words: ['put', 'down', 'all', 'he', 'meant', 'to', 'say,'],
        wordIndex: 154500,
        actualCount: 7,
        percent: '36.0'
      };
      
      Display.printSnapshot(position);
      
      assert.strictEqual(clearCalled, false); // Should NOT clear in snapshot mode
      assert.strictEqual(logOutput.length, 1);
      assert.strictEqual(logOutput[0], 'put down all he meant to say,');
    });
    
    it('should work with single word', () => {
      const position = {
        words: ['word'],
        wordIndex: 0,
        actualCount: 1,
        percent: '0.0'
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
      const stats = {
        requests: 5,
        bytesDownloaded: 12345,
        totalBytes: 100000,
        efficiency: '12.3%'
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
      const stats = {
        requests: 5,
        bytesDownloaded: 12345,
        totalBytes: 100000,
        efficiency: '12.3%'
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
