import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CliOptions } from '../src/cli-options.js';

describe('CliOptions', () => {
  describe('basic parsing', () => {
    it('should parse valid arguments without flags', () => {
      const options = new CliOptions(['996', '7', '36']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.bookId, 996);
      assert.strictEqual(options.chunkSize, 7);
      assert.strictEqual(options.startPercent, 36);
      assert.strictEqual(options.snapshot, false);
      assert.strictEqual(options.raw, false);
    });
    
    it('should parse arguments with different numbers', () => {
      const options = new CliOptions(['1234', '10', '0']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.bookId, 1234);
      assert.strictEqual(options.chunkSize, 10);
      assert.strictEqual(options.startPercent, 0);
    });
    
    it('should handle 100 percent', () => {
      const options = new CliOptions(['1', '5', '100']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.startPercent, 100);
    });
    
    it('should use defaults when only bookId provided', () => {
      const options = new CliOptions(['1342']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.bookId, 1342);
      assert.strictEqual(options.chunkSize, 200);
      assert.strictEqual(options.startPercent, 0);
    });
    
    it('should use default startPercent when two args provided', () => {
      const options = new CliOptions(['1342', '50']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.bookId, 1342);
      assert.strictEqual(options.chunkSize, 50);
      assert.strictEqual(options.startPercent, 0);
    });
  });
  
  describe('--snapshot flag', () => {
    it('should parse --snapshot flag', () => {
      const options = new CliOptions(['--snapshot', '996', '7', '36']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.snapshot, true);
      assert.strictEqual(options.raw, false);
      assert.strictEqual(options.bookId, 996);
    });
    
    it('should parse --snapshot flag at end', () => {
      const options = new CliOptions(['996', '7', '36', '--snapshot']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.snapshot, true);
    });
    
    it('should parse --snapshot flag in middle', () => {
      const options = new CliOptions(['996', '--snapshot', '7', '36']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.snapshot, true);
      assert.strictEqual(options.chunkSize, 7);
    });
  });
  
  describe('--raw flag', () => {
    it('should parse --raw flag', () => {
      const options = new CliOptions(['--raw', '996', '7', '36']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.raw, true);
      assert.strictEqual(options.snapshot, false);
      assert.strictEqual(options.bookId, 996);
    });
    
    it('should parse --raw flag at end', () => {
      const options = new CliOptions(['996', '7', '36', '--raw']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.raw, true);
    });
  });
  
  describe('multiple flags', () => {
    it('should parse both --snapshot and --raw', () => {
      const options = new CliOptions(['--snapshot', '--raw', '996', '7', '36']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.snapshot, true);
      assert.strictEqual(options.raw, true);
      assert.strictEqual(options.bookId, 996);
    });
    
    it('should parse flags in any order', () => {
      const options = new CliOptions(['996', '--raw', '7', '--snapshot', '36']);
      
      assert.strictEqual(options.isValid(), true);
      assert.strictEqual(options.snapshot, true);
      assert.strictEqual(options.raw, true);
      assert.strictEqual(options.chunkSize, 7);
    });
  });
  
  describe('validation errors', () => {
    it('should reject zero arguments', () => {
      const options = new CliOptions([]);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.length > 0);
      assert.ok(options.getErrorMessage()!.includes('positional arguments'));
    });
    
    it('should reject non-numeric bookId', () => {
      const options = new CliOptions(['abc', '7', '36']);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.some(e => e.includes('must be a number')));
    });
    
    it('should reject non-numeric chunkSize', () => {
      const options = new CliOptions(['996', 'xyz', '36']);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.some(e => e.includes('must be a number')));
    });
    
    it('should reject non-numeric startPercent', () => {
      const options = new CliOptions(['996', '7', 'bad']);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.some(e => e.includes('must be a number')));
    });
    
    it('should reject negative startPercent', () => {
      const options = new CliOptions(['996', '7', '-5']);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.some(e => e.includes('between 0 and 100')));
    });
    
    it('should reject startPercent over 100', () => {
      const options = new CliOptions(['996', '7', '150']);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.some(e => e.includes('between 0 and 100')));
    });
    
    it('should reject chunkSize less than 1', () => {
      const options = new CliOptions(['996', '0', '36']);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.some(e => e.includes('at least 1')));
    });
    
    it('should reject unknown flags', () => {
      const options = new CliOptions(['--invalid', '996', '7', '36']);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.some(e => e.includes('Unknown flag')));
    });
    
    it('should accumulate multiple errors', () => {
      const options = new CliOptions(['abc', 'xyz', '200']);
      
      assert.strictEqual(options.isValid(), false);
      assert.ok(options.errors.length >= 1);
    });
  });
  
  describe('usage message', () => {
    it('should provide usage message', () => {
      const options = new CliOptions([]);
      const usage = options.getUsageMessage();
      
      assert.ok(usage.includes('Usage:'));
      assert.ok(usage.includes('--help'));
      assert.ok(usage.includes('examples'));
    });
    
    it('should return null error message when valid', () => {
      const options = new CliOptions(['996', '7', '36']);
      
      assert.strictEqual(options.getErrorMessage(), null);
    });
  });
});
