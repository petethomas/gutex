/**
 * Tests for the advanced Project Gutenberg boilerplate cleaner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  Cleaner,
  normalizeLine,
  boundedLevenshtein,
  fuzzyMarkerMatch,
  anyFuzzy,
  START_MARKERS,
  END_MARKERS,
  DEFAULT_OPTS
} from '../src/cleaner.js';

describe('Cleaner - Advanced Boilerplate Stripping', () => {
  
  describe('normalizeLine', () => {
    it('should uppercase and collapse whitespace', () => {
      assert.strictEqual(normalizeLine('hello  world'), 'HELLO WORLD');
    });
    
    it('should remove BOM characters', () => {
      assert.strictEqual(normalizeLine('\uFEFFhello'), 'HELLO');
    });
    
    it('should replace punctuation with spaces', () => {
      assert.strictEqual(normalizeLine('hello, world!'), 'HELLO WORLD');
    });
    
    it('should preserve asterisks', () => {
      assert.strictEqual(normalizeLine('*** START ***'), '*** START ***');
    });
    
    it('should handle empty strings', () => {
      assert.strictEqual(normalizeLine(''), '');
      assert.strictEqual(normalizeLine(null as unknown as string), '');
      assert.strictEqual(normalizeLine(undefined as unknown as string), '');
    });
    
    it('should trim whitespace', () => {
      assert.strictEqual(normalizeLine('  hello  '), 'HELLO');
    });
  });

  describe('boundedLevenshtein', () => {
    it('should return 0 for identical strings', () => {
      assert.strictEqual(boundedLevenshtein('hello', 'hello', 5), 0);
    });
    
    it('should return correct distance for simple edits', () => {
      assert.strictEqual(boundedLevenshtein('hello', 'hallo', 5), 1);
      assert.strictEqual(boundedLevenshtein('hello', 'hell', 5), 1);
      assert.strictEqual(boundedLevenshtein('hello', 'helloo', 5), 1);
    });
    
    it('should return maxDist+1 when exceeded', () => {
      assert.strictEqual(boundedLevenshtein('hello', 'world', 2), 3);
    });
    
    it('should handle empty strings', () => {
      assert.strictEqual(boundedLevenshtein('', '', 5), 0);
      assert.strictEqual(boundedLevenshtein('hello', '', 5), 5);
      assert.strictEqual(boundedLevenshtein('', 'hello', 5), 5);
    });
    
    it('should early-exit for large length differences', () => {
      assert.strictEqual(boundedLevenshtein('hi', 'hello world', 3), 4);
    });
  });

  describe('fuzzyMarkerMatch', () => {
    const opts = DEFAULT_OPTS;
    
    it('should match exact substrings', () => {
      const line = normalizeLine('*** START OF THIS PROJECT GUTENBERG EBOOK ***');
      const marker = normalizeLine('START OF THIS PROJECT GUTENBERG');
      assert.ok(fuzzyMarkerMatch(line, marker, opts));
    });
    
    it('should match with small typos', () => {
      const line = normalizeLine('*** STRAT OF THIS PROJECT GUTENBERG EBOOK ***');
      const marker = normalizeLine('START OF THIS PROJECT GUTENBERG');
      assert.ok(fuzzyMarkerMatch(line, marker, opts));
    });
    
    it('should not match completely different strings', () => {
      const line = normalizeLine('CHAPTER ONE: THE BEGINNING');
      const marker = normalizeLine('START OF THIS PROJECT GUTENBERG');
      assert.ok(!fuzzyMarkerMatch(line, marker, opts));
    });
    
    it('should handle empty lines', () => {
      const marker = normalizeLine('START OF THIS PROJECT GUTENBERG');
      assert.ok(!fuzzyMarkerMatch('', marker, opts));
      assert.ok(!fuzzyMarkerMatch(null as unknown as string, marker, opts));
    });
  });

  describe('anyFuzzy', () => {
    const opts = DEFAULT_OPTS;
    const markers = [
      normalizeLine('START OF THIS PROJECT GUTENBERG'),
      normalizeLine('START OF THE PROJECT GUTENBERG')
    ];
    
    it('should return true if any marker matches', () => {
      const line = normalizeLine('*** START OF THE PROJECT GUTENBERG EBOOK ***');
      assert.ok(anyFuzzy(line, markers, opts));
    });
    
    it('should return false if no marker matches', () => {
      const line = normalizeLine('CHAPTER ONE');
      assert.ok(!anyFuzzy(line, markers, opts));
    });
  });

  describe('Cleaner.stripBoilerplate', () => {
    
    it('should strip standard modern PG boilerplate', () => {
      const text = `The Project Gutenberg EBook of Test Book, by Test Author

This eBook is for the use of anyone anywhere at no cost.

*** START OF THIS PROJECT GUTENBERG EBOOK TEST BOOK ***

Produced by Test Producer

CHAPTER 1

It was a dark and stormy night.

The end.

*** END OF THIS PROJECT GUTENBERG EBOOK TEST BOOK ***

End of Project Gutenberg's Test Book.`;

      const cleaned = Cleaner.stripBoilerplate(text);
      
      assert.ok(cleaned.includes('CHAPTER 1'), 'Should include chapter');
      assert.ok(cleaned.includes('dark and stormy'), 'Should include content');
      assert.ok(!cleaned.includes('Project Gutenberg EBook'), 'Should not include header');
      assert.ok(!cleaned.includes('END OF THIS PROJECT'), 'Should not include footer marker');
    });

    it('should handle PG boilerplate without spaces around asterisks', () => {
      const text = `Header stuff
***START OF THIS PROJECT GUTENBERG EBOOK TEST***
Actual content here.
***END OF THIS PROJECT GUTENBERG EBOOK TEST***
Footer stuff`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Actual content'), 'Should include content');
      assert.ok(!cleaned.includes('Header stuff'), 'Should not include header');
    });

    it('should skip "Produced by" lines after start marker', () => {
      const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***
Produced by Anonymous Volunteers
Distributed Proofreaders at www.pgdp.net

THE ACTUAL TITLE

Chapter 1
Content here.

*** END OF THIS PROJECT GUTENBERG EBOOK ***`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('THE ACTUAL TITLE'), 'Should include title');
      assert.ok(cleaned.includes('Content here'), 'Should include content');
      assert.ok(!cleaned.includes('Produced by'), 'Should skip producer credits');
      assert.ok(!cleaned.includes('Distributed Proofreaders'), 'Should skip DP credits');
    });

    it('should handle old SMALL PRINT disclaimer blocks', () => {
      const text = `The Project Gutenberg Etext of Test
*END*THE SMALL PRINT! FOR PUBLIC DOMAIN ETEXTS*Ver.04.29.93*END*

This etext was prepared by someone.

Blah blah legal stuff.

***START OF THE PROJECT GUTENBERG EBOOK***

ACTUAL BOOK CONTENT

End of Project Gutenberg's Test`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('ACTUAL BOOK CONTENT'), 'Should include content');
      assert.ok(!cleaned.includes('SMALL PRINT'), 'Should not include small print');
    });

    it('should handle PG Australia format', () => {
      const text = `A Project Gutenberg of Australia eBook

Title: Test Book
Author: Test Author

To contact Project Gutenberg of Australia, go to:
http://gutenberg.net.au

Title: Test Book
Author: Test Author

THE REAL CONTENT STARTS HERE

And continues.

End of the Project Gutenberg Australia ebook`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('THE REAL CONTENT'), 'Should include content');
      assert.ok(!cleaned.includes('To contact Project Gutenberg'), 'Should skip contact info');
    });

    it('should handle missing start marker gracefully', () => {
      const text = `This is some content without standard markers.

It should still work.

End of the book.`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.length > 0, 'Should return non-empty content');
      assert.ok(cleaned.includes('without standard markers'), 'Should preserve content');
    });

    it('should handle missing end marker gracefully', () => {
      const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***

Content without an end marker.

Just keeps going.`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Content without'), 'Should include content');
      assert.ok(cleaned.includes('keeps going'), 'Should include end content');
    });

    it('should handle various END marker formats', () => {
      const variants = [
        'End of the Project Gutenberg EBook',
        "End of Project Gutenberg's Test",
        '*** END OF THE PROJECT GUTENBERG EBOOK ***',
        'End of Project Gutenberg Etext'
      ];
      
      for (const ending of variants) {
        const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***
Content.
${ending}
Footer to remove.`;
        
        const cleaned = Cleaner.stripBoilerplate(text);
        assert.ok(cleaned.includes('Content'), `Should work with ending: ${ending}`);
        assert.ok(!cleaned.includes('Footer to remove'), `Should strip footer with: ${ending}`);
      }
    });

    it('should handle BOM at start of file', () => {
      const text = `\uFEFF*** START OF THIS PROJECT GUTENBERG EBOOK ***
Content after BOM.
*** END OF THIS PROJECT GUTENBERG EBOOK ***`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Content after BOM'), 'Should handle BOM');
    });

    it('should handle Windows line endings (CRLF)', () => {
      const text = '*** START OF THIS PROJECT GUTENBERG EBOOK ***\r\n' +
                   'Content with CRLF.\r\n' +
                   '*** END OF THIS PROJECT GUTENBERG EBOOK ***\r\n';

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Content with CRLF'), 'Should handle CRLF');
    });

    it('should calculate correct byte offset with CRLF line endings', () => {
      // This is a regression test for the CRLF byte offset bug
      // The bug was: \r characters were stripped before calculating byte offsets,
      // causing the offset to be N bytes too small (where N = number of lines)
      const text = 'Header line\r\n' +
                   '*** START OF THIS PROJECT GUTENBERG EBOOK ***\r\n' +
                   'THE ACTUAL CONTENT\r\n' +
                   '*** END OF THIS PROJECT GUTENBERG EBOOK ***\r\n';

      // Calculate expected byte offset for "THE ACTUAL CONTENT" line
      // "Header line\r\n" = 13 bytes
      // "*** START OF THIS PROJECT GUTENBERG EBOOK ***\r\n" = 48 bytes
      // Total = 61 bytes to start of content
      const expectedOffset = Buffer.byteLength('Header line\r\n*** START OF THIS PROJECT GUTENBERG EBOOK ***\r\n');
      
      const result = Cleaner._findStartBoundaryAdvanced(text);
      
      assert.strictEqual(result.byteOffset, expectedOffset, 
        `Byte offset should be ${expectedOffset}, got ${result.byteOffset}. ` +
        'CRLF line endings may not be accounted for correctly.');
      
      // Also verify the actual content at that offset
      const contentAtOffset = text.slice(result.byteOffset);
      assert.ok(contentAtOffset.startsWith('THE ACTUAL CONTENT'), 
        `Content at offset should start with title, got: "${contentAtOffset.slice(0, 30)}"`);
    });
  });

  describe('Cleaner._findStartBoundaryAdvanced', () => {
    it('should return byte offset and metadata', () => {
      const text = `Header line
*** START OF THIS PROJECT GUTENBERG EBOOK ***
Content starts here.`;

      const result = Cleaner._findStartBoundaryAdvanced(text);
      
      assert.ok(result.byteOffset > 0, 'Should have byte offset');
      assert.ok(result.found, 'Should mark as found');
      assert.strictEqual(result.isAustralian, false, 'Should not be Australian');
    });

    it('should detect PG Australia', () => {
      const text = `A Project Gutenberg of Australia eBook
To contact Project Gutenberg of Australia go to:
gutenberg.net.au
Actual content`;

      const result = Cleaner._findStartBoundaryAdvanced(text);
      assert.ok(result.isAustralian, 'Should detect Australian format');
    });
  });

  describe('Cleaner._findEndBoundaryAdvanced', () => {
    it('should return byte offset for found marker', () => {
      const text = `Some content
*** END OF THIS PROJECT GUTENBERG EBOOK ***
Footer stuff`;

      const result = Cleaner._findEndBoundaryAdvanced(text);
      
      assert.ok(result.found, 'Should find end marker');
      assert.ok(result.byteOffset !== null, 'Should have byte offset');
    });

    it('should handle legalese markers', () => {
      const text = `Content here
THE FULL PROJECT GUTENBERG LICENSE
License text follows`;

      const result = Cleaner._findEndBoundaryAdvanced(text);
      assert.ok(result.found, 'Should find legalese start as end marker');
    });
  });

  describe('Legacy compatibility', () => {
    it('should maintain START_MARKERS class property', () => {
      assert.ok(Array.isArray(Cleaner.START_MARKERS));
      assert.ok(Cleaner.START_MARKERS.length >= 3);
    });

    it('should maintain END_MARKERS class property', () => {
      assert.ok(Array.isArray(Cleaner.END_MARKERS));
      assert.ok(Cleaner.END_MARKERS.length >= 4);
    });

    it('should maintain _findStartBoundary legacy method', () => {
      const text = `Header
*** START OF THIS PROJECT GUTENBERG EBOOK TEST ***
Content`;

      const result = Cleaner._findStartBoundary(text);
      assert.ok(result !== null, 'Should find boundary');
      assert.ok(typeof result === 'number', 'Should return number');
    });

    it('should maintain _findEndBoundary legacy method', () => {
      const text = `Content
*** END OF THIS PROJECT GUTENBERG EBOOK TEST ***
Footer`;

      const result = Cleaner._findEndBoundary(text);
      assert.ok(result !== null, 'Should find boundary');
      assert.ok(typeof result === 'number', 'Should return number');
    });
  });

  describe('Cleaner utility methods', () => {
    it('should extract words correctly', () => {
      const text = 'one two three four five six seven eight nine ten';
      const result = Cleaner.extractWords(text, 0, 5);
      
      assert.strictEqual(result.words.length, 5);
      assert.strictEqual(result.words[0], 'one');
      assert.strictEqual(result.words[4], 'five');
      assert.strictEqual(result.actualCount, 5);
      assert.strictEqual(result.totalWordsInChunk, 10);
    });

    it('should count words correctly', () => {
      assert.strictEqual(Cleaner.countWords('one two three'), 3);
      assert.strictEqual(Cleaner.countWords(''), 0);
      assert.strictEqual(Cleaner.countWords('   spaces   everywhere   '), 2);
    });
  });

  describe('Real-world edge cases', () => {
    it('should handle Complete Works of Shakespeare case', () => {
      // This is a known problematic case where old format has nested markers
      const text = `The Project Gutenberg EBook of The Complete Works of William Shakespeare

*Project Gutenberg is proud to cooperate with The World Library*

["Small Print" V.12.08.93]

THE SONNETS
by William Shakespeare

I
FROM fairest creatures we desire increase,

End of the Project Gutenberg EBook`;

      const cleaned = Cleaner.stripBoilerplate(text);
      // Should not return almost nothing like the Python bug
      assert.ok(cleaned.length > 50, 'Should preserve substantial content');
    });

    it('should handle Moby Dick style formatting', () => {
      const text = `The Project Gutenberg EBook of Moby Dick, by Herman Melville

*** START OF THIS PROJECT GUTENBERG EBOOK MOBY DICK ***

Produced by Anonymous

MOBY DICK;

or, THE WHALE.

By Herman Melville



CONTENTS

CHAPTER 1. Loomings.

Call me Ishmael.

*** END OF THIS PROJECT GUTENBERG EBOOK MOBY DICK ***`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Call me Ishmael'), 'Should include famous line');
      assert.ok(cleaned.includes('MOBY DICK'), 'Should include title');
      assert.ok(!cleaned.includes('Produced by'), 'Should skip producer');
    });

    it('should handle ancient PG format (1990s)', () => {
      const text = `*BEFORE THE SMALL PRINT!*

Please take a look at the important information in this header.

*END*THE SMALL PRINT! FOR PUBLIC DOMAIN ETEXTS*

This etext was prepared by
Test Preparer <test@example.com>

Actual book content starts here.

End of Project Gutenberg Etext`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Actual book content'), 'Should find content');
      assert.ok(!cleaned.includes('SMALL PRINT'), 'Should skip small print');
    });
  });
});
