import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { Fetcher } from '../lib/fetcher.js';
import { Cleaner } from '../lib/cleaner.js';
import { Navigator } from '../lib/navigator.js';

describe('Gutex Test Suite', () => {
  
  describe('Fetcher', () => {
    let fetcher;

    before(() => {
      fetcher = new Fetcher(996); // Don Quixote
    });

    it('should get file size for valid book', async () => {
      const size = await fetcher.getFileSize();
      assert.ok(size > 0, 'File size should be positive');
      assert.ok(size > 100000, 'Don Quixote should be large file');
    });

    it('should fetch byte range', async () => {
      const chunk = await fetcher.fetchRange(0, 500);
      assert.ok(chunk.length > 0, 'Should fetch data');
      assert.ok(chunk.length <= 501, 'Should respect range request');
    });

    it('should handle invalid book ID gracefully', async () => {
      const invalidFetcher = new Fetcher(99999999);
      await assert.rejects(
        () => invalidFetcher.getFileSize(),
        /not found/i,
        'Should reject with not found error'
      );
    });
  });

  describe('Cleaner', () => {
    
    it('should find Project Gutenberg start marker', () => {
      const sampleText = `Some header text
*** START OF THIS PROJECT GUTENBERG EBOOK DON QUIXOTE ***
The actual book content starts here.`;
      
      const startByte = Cleaner._findStartBoundary(sampleText);
      assert.ok(startByte !== null, 'Should find start boundary');
      assert.ok(startByte > 0, 'Start should be after marker');
    });

    it('should find Project Gutenberg end marker', () => {
      const sampleText = `Book content here.
*** END OF THIS PROJECT GUTENBERG EBOOK DON QUIXOTE ***
Some footer text`;
      
      const endByte = Cleaner._findEndBoundary(sampleText);
      assert.ok(endByte !== null, 'Should find end boundary');
      assert.ok(endByte > 0, 'End should be positive');
    });

    it('should extract exact word count from text', () => {
      const text = 'one two three four five six seven eight nine ten';
      const result = Cleaner.extractWords(text, 0, 5);
      
      assert.strictEqual(result.words.length, 5, 'Should extract 5 words');
      assert.strictEqual(result.words[0], 'one', 'First word should be "one"');
      assert.strictEqual(result.words[4], 'five', 'Fifth word should be "five"');
    });

    it('should extract words from middle of text', () => {
      const text = 'one two three four five six seven eight nine ten';
      const result = Cleaner.extractWords(text, 3, 4);
      
      assert.strictEqual(result.words.length, 4, 'Should extract 4 words');
      assert.strictEqual(result.words[0], 'four', 'First word should be "four"');
      assert.strictEqual(result.words[3], 'seven', 'Fourth word should be "seven"');
    });

    it('should handle whitespace correctly', () => {
      const text = '  one   two  \n  three\t\tfour  ';
      const result = Cleaner.extractWords(text, 0, 4);
      
      assert.strictEqual(result.words.length, 4, 'Should extract 4 words ignoring whitespace');
    });

    it('should count words accurately', () => {
      const text = 'one two three four five';
      const count = Cleaner.countWords(text);
      assert.strictEqual(count, 5, 'Should count 5 words');
    });
  });

  describe('Navigator', () => {
    let navigator;
    let fetcher;

    before(async () => {
      fetcher = new Fetcher(1342); // Pride and Prejudice - smaller, faster tests
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);
      navigator = new Navigator(fetcher, boundaries, 10);
    });

    it('should navigate to percentage position', async () => {
      const result = await navigator.goToPercent(50);
      assert.ok(result.words.length > 0, 'Should return words');
      assert.ok(result.wordIndex >= 0, 'Should have valid word index');
      assert.ok(parseFloat(result.percent) >= 40 && parseFloat(result.percent) <= 60, 
        'Should be near 50%');
    });

    it('should navigate to start of book', async () => {
      const result = await navigator.goToPercent(0);
      assert.ok(result.words.length > 0, 'Should return words at start');
      assert.strictEqual(result.wordIndex, 0, 'Should start at word 0');
    });

    it('should move forward from position', async () => {
      const start = await navigator.goToPercent(25);
      const forward = await navigator.moveForward(start);
      
      assert.ok(forward.wordIndex > start.wordIndex, 'Should move forward');
      assert.strictEqual(
        forward.wordIndex, 
        start.wordIndex + navigator.chunkSize,
        'Should move by chunk size'
      );
    });

    it('should move backward from position', async () => {
      const start = await navigator.goToPercent(50);
      const backward = await navigator.moveBackward(start);
      
      assert.ok(backward.wordIndex < start.wordIndex, 'Should move backward');
      assert.strictEqual(
        backward.wordIndex,
        start.wordIndex - navigator.chunkSize,
        'Should move back by chunk size'
      );
    });

    it('should not go below zero when moving backward', async () => {
      const start = await navigator.goToPercent(0);
      const backward = await navigator.moveBackward(start);
      
      assert.strictEqual(backward.wordIndex, 0, 'Should not go below 0');
    });

    it('should detect near end of book', async () => {
      const result = await navigator.goToPercent(99.5);
      // Near end might have fewer words than chunk size
      assert.ok(result.wordIndex >= 0, 'Should have valid position near end');
    });
  });

  describe('Integration Tests', () => {
    
    it('should handle complete navigation workflow', async () => {
      const fetcher = new Fetcher(84); // Frankenstein - medium size
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);
      const navigator = new Navigator(fetcher, boundaries, 7);
      
      // Start at beginning
      let position = await navigator.goToPercent(0);
      assert.strictEqual(position.wordIndex, 0, 'Should start at 0');
      assert.strictEqual(position.actualCount, 7, 'Should get 7 words');
      
      // Move forward 3 times
      position = await navigator.moveForward(position);
      position = await navigator.moveForward(position);
      position = await navigator.moveForward(position);
      assert.strictEqual(position.wordIndex, 21, 'Should be at word 21');
      
      // Move backward once
      position = await navigator.moveBackward(position);
      assert.strictEqual(position.wordIndex, 14, 'Should be at word 14');
    });

    it('should handle percentage-based jumps accurately', async () => {
      const fetcher = new Fetcher(1342);
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);
      const navigator = new Navigator(fetcher, boundaries, 5);
      
      const pos0 = await navigator.goToPercent(0);
      const pos50 = await navigator.goToPercent(50);
      const pos100 = await navigator.goToPercent(99);
      
      assert.ok(pos0.wordIndex < pos50.wordIndex, '0% < 50%');
      assert.ok(pos50.wordIndex < pos100.wordIndex, '50% < 100%');
    });
  });

  describe('Edge Cases', () => {
    
    it('should handle very small chunk sizes', async () => {
      const fetcher = new Fetcher(1342);
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);
      const navigator = new Navigator(fetcher, boundaries, 1);
      
      const result = await navigator.goToPercent(25);
      assert.strictEqual(result.actualCount, 1, 'Should return single word');
    });

    it('should handle large chunk sizes', async () => {
      const fetcher = new Fetcher(1342);
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);
      const navigator = new Navigator(fetcher, boundaries, 100);
      
      const result = await navigator.goToPercent(10);
      assert.ok(result.actualCount > 0, 'Should return words');
      assert.ok(result.actualCount <= 100, 'Should not exceed requested size');
    });
  });
});
