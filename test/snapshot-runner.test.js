import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SnapshotRunner } from '../lib/snapshot-runner.js';

describe('SnapshotRunner', () => {
  let originalExit;
  let exitCode;
  let originalLog;
  let originalError;
  let logOutput;
  let errorOutput;
  
  beforeEach(() => {
    // Capture outputs
    logOutput = [];
    errorOutput = [];
    exitCode = null;
    
    originalLog = console.log;
    originalError = console.error;
    originalExit = process.exit;
    
    console.log = (...args) => {
      logOutput.push(args.join(' '));
    };
    
    console.error = (...args) => {
      errorOutput.push(args.join(' '));
    };
    
    process.exit = (code) => {
      exitCode = code;
      throw new Error('EXIT'); // Throw to stop execution
    };
  });
  
  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  });
  
  describe('snapshot mode behavior', () => {
    it('should create runner with correct parameters', () => {
      const runner = new SnapshotRunner(996, 7, 36);
      
      assert.strictEqual(runner.bookId, 996);
      assert.strictEqual(runner.chunkSize, 7);
      assert.strictEqual(runner.startPercent, 36);
    });
    
    it('should accept different parameter values', () => {
      const runner = new SnapshotRunner(1234, 10, 50);
      
      assert.strictEqual(runner.bookId, 1234);
      assert.strictEqual(runner.chunkSize, 10);
      assert.strictEqual(runner.startPercent, 50);
    });
  });
  
  describe('error handling', () => {
    it('should handle invalid book ID gracefully', async () => {
      const runner = new SnapshotRunner(99999999, 7, 36);
      
      try {
        await runner.run();
        assert.fail('Should have thrown');
      } catch (err) {
        if (err.message !== 'EXIT') {
          throw err;
        }
      }
      
      assert.strictEqual(exitCode, 1);
      assert.ok(errorOutput.length > 0);
      assert.ok(errorOutput.some(line => line.includes('Error')));
    });
  });
  
  // Note: Full integration tests that actually fetch from Project Gutenberg
  // would require network access and are better suited for e2e tests.
  // These tests verify the structure and error handling.
});
