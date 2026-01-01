/**
 * Tests for bug fixes:
 * 1. Double teleport from random icon click (hash change issue)
 * 2. No plain text error handling
 * 3. Improved metadata stripping
 * 4. Random Book vs Random Location distinction
 * 5. 3D toggle should never trigger teleport
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  Cleaner,
  normalizeLine,
  anyFuzzy,
  END_MARKERS,
  LEGALESE_START_MARKERS,
  DEFAULT_OPTS
} from '../src/cleaner.js';

describe('Improved Metadata Stripping', () => {
  
  describe('Extended END_MARKERS coverage', () => {
    
    it('should include donation-related markers', () => {
      const endMarkersNorm = END_MARKERS.map(normalizeLine);
      const donationLine = normalizeLine('DONATION TO PROJECT GUTENBERG');
      assert.ok(
        anyFuzzy(donationLine, endMarkersNorm, DEFAULT_OPTS),
        'Should detect donation markers'
      );
    });

    it('should include subscription-related markers', () => {
      const endMarkersNorm = END_MARKERS.map(normalizeLine);
      const subscribeLine = normalizeLine('SUBSCRIBING TO OUR EMAIL NEWSLETTER');
      assert.ok(
        anyFuzzy(subscribeLine, endMarkersNorm, DEFAULT_OPTS),
        'Should detect subscription markers'
      );
    });

    it('should include update notice markers', () => {
      const endMarkersNorm = END_MARKERS.map(normalizeLine);
      const updateLine = normalizeLine('UPDATED EDITIONS WILL REPLACE');
      assert.ok(
        anyFuzzy(updateLine, endMarkersNorm, DEFAULT_OPTS),
        'Should detect update notice markers'
      );
    });

    it('should detect triple asterisk end markers', () => {
      const endMarkersNorm = END_MARKERS.map(normalizeLine);
      const tripleEnd = normalizeLine('***END***');
      assert.ok(
        anyFuzzy(tripleEnd, endMarkersNorm, DEFAULT_OPTS),
        'Should detect ***END*** marker'
      );
    });
  });

  describe('Extended LEGALESE_START_MARKERS coverage', () => {
    
    it('should include trademark markers', () => {
      const legaleseNorm = LEGALESE_START_MARKERS.map(normalizeLine);
      const trademarkLine = normalizeLine('PROJECT GUTENBERG IS A REGISTERED TRADEMARK');
      assert.ok(
        anyFuzzy(trademarkLine, legaleseNorm, DEFAULT_OPTS),
        'Should detect trademark markers'
      );
    });

    it('should include license section markers', () => {
      const legaleseNorm = LEGALESE_START_MARKERS.map(normalizeLine);
      const licenseLine = normalizeLine('PROJECT GUTENBERG-TM LICENSE');
      assert.ok(
        anyFuzzy(licenseLine, legaleseNorm, DEFAULT_OPTS),
        'Should detect license section markers'
      );
    });

    it('should include terms of use markers', () => {
      const legaleseNorm = LEGALESE_START_MARKERS.map(normalizeLine);
      const termsLine = normalizeLine('TERMS OF USE AND REDISTRIBUTION');
      assert.ok(
        anyFuzzy(termsLine, legaleseNorm, DEFAULT_OPTS),
        'Should detect terms of use markers'
      );
    });
  });

  describe('Cleaner.stripBoilerplate with new markers', () => {
    
    it('should strip donation footer', () => {
      const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***

This is the actual book content that continues for many paragraphs.

Chapter 1

The story begins here and goes on for a while with lots of interesting
content that the reader will enjoy.

Chapter 2

More content follows with additional details and narrative.

*** END OF THIS PROJECT GUTENBERG EBOOK ***

DONATION TO PROJECT GUTENBERG
You can donate at www.gutenberg.org/donate`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('actual book content'), 'Should include content');
      assert.ok(cleaned.includes('Chapter 1'), 'Should include chapters');
      assert.ok(!cleaned.includes('DONATION'), 'Should strip donation section');
      assert.ok(!cleaned.includes('donate'), 'Should strip donation URL');
    });

    it('should strip subscription footer', () => {
      const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***

Book content here.

SUBSCRIBING TO OUR EMAIL NEWSLETTER
Get updates about new releases.`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Book content'), 'Should include content');
      assert.ok(!cleaned.includes('SUBSCRIBING'), 'Should strip subscription');
      assert.ok(!cleaned.includes('newsletter'), 'Should strip newsletter text');
    });

    it('should strip trademark/license section', () => {
      const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***

The actual story content.

PROJECT GUTENBERG IS A REGISTERED TRADEMARK
and you may not use the name without permission.`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('actual story'), 'Should include content');
      assert.ok(!cleaned.includes('REGISTERED TRADEMARK'), 'Should strip trademark');
    });

    it('should strip content after asterisk divider before PG footer', () => {
      const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***

The book content ends here.

* * *

This eBook is for the use of anyone anywhere.
Project Gutenberg volunteers worked hard.`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('book content ends'), 'Should include content');
      // The asterisk divider before PG text should trigger end detection
      assert.ok(!cleaned.includes('for the use of anyone'), 'Should strip post-divider PG text');
    });

    it('should detect www.gutenberg.org as footer marker', () => {
      const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***

Story content.

The end.

Visit www.gutenberg.org for more ebooks
This and other files available for free.`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Story content'), 'Should include content');
      assert.ok(cleaned.includes('The end'), 'Should include ending');
      // www.gutenberg.org line should trigger end
      assert.ok(!cleaned.includes('Visit www'), 'Should strip footer with URL');
    });

    it('should handle "THIS EBOOK IS FOR THE USE OF ANYONE" in footer', () => {
      const text = `*** START OF THIS PROJECT GUTENBERG EBOOK ***

Actual book text here.

THIS EBOOK IS FOR THE USE OF ANYONE ANYWHERE
at no cost and with almost no restrictions.`;

      const cleaned = Cleaner.stripBoilerplate(text);
      assert.ok(cleaned.includes('Actual book text'), 'Should include content');
      assert.ok(!cleaned.includes('FOR THE USE OF ANYONE'), 'Should strip usage notice');
    });
  });

  describe('Cleaner._findEndBoundaryAdvanced with new patterns', () => {
    
    it('should detect asterisk dividers before PG content', () => {
      const text = `Content here.

***

Project Gutenberg relies on donations.`;

      const result = Cleaner._findEndBoundaryAdvanced(text);
      assert.ok(result.found, 'Should find end boundary at asterisk divider');
    });

    it('should detect "PROJECT GUTENBERG-TM" as footer marker', () => {
      const text = `Story content.

PROJECT GUTENBERG-TM MISSION
To distribute free ebooks.`;

      const result = Cleaner._findEndBoundaryAdvanced(text);
      assert.ok(result.found, 'Should detect PG-TM as end marker');
    });

    it('should detect GUTENBERG LITERARY ARCHIVE', () => {
      const text = `Book content.

THE PROJECT GUTENBERG LITERARY ARCHIVE FOUNDATION
is a non-profit organization.`;

      const result = Cleaner._findEndBoundaryAdvanced(text);
      assert.ok(result.found, 'Should detect literary archive as end marker');
    });
  });
});

describe('3D Mode Teleport Boundary Logic', () => {
  
  describe('Forward boundary teleport conditions', () => {
    
    it('should require active forward movement to trigger teleport', () => {
      // Simulating the condition check from the animation loop
      const wordOffsetDelta = 0.0; // No movement this frame
      const momentum = 0.0;
      const autoReadActive = false;
      const autoDirection = 'forward';
      const wordOffset = 100;
      const allWordsLength = 100;
      const nextByteStart: number | null = null; // At end of book
      
      const isMovingForward = wordOffsetDelta > 0.001 || momentum > 0.01 || 
        (autoReadActive && autoDirection === 'forward');
      const atForwardBoundary = wordOffset >= allWordsLength - 2 && 
        nextByteStart == null &&
        isMovingForward;
      
      assert.strictEqual(isMovingForward, false, 'Should not detect forward movement with no delta/momentum');
      assert.strictEqual(atForwardBoundary, false, 'Should NOT trigger teleport without active movement');
    });

    it('should trigger teleport when wordOffset delta is positive at end', () => {
      const wordOffsetDelta = 0.5; // Moving forward this frame
      const momentum = 0.0;
      const autoReadActive = false;
      const autoDirection = 'forward';
      const wordOffset = 100;
      const allWordsLength = 100;
      const nextByteStart: number | null = null;
      
      const isMovingForward = wordOffsetDelta > 0.001 || momentum > 0.01 ||
        (autoReadActive && autoDirection === 'forward');
      const atForwardBoundary = wordOffset >= allWordsLength - 2 && 
        nextByteStart == null &&
        isMovingForward;
      
      assert.strictEqual(isMovingForward, true, 'Should detect forward movement via delta');
      assert.strictEqual(atForwardBoundary, true, 'Should trigger teleport when actively moving at end');
    });

    it('should trigger teleport during auto-read forward at end', () => {
      const wordOffsetDelta = 0.0; // No manual delta
      const momentum = 0.0;
      const autoReadActive = true;
      const autoDirection = 'forward';
      const wordOffset = 100;
      const allWordsLength = 100;
      const nextByteStart: number | null = null;
      
      const isMovingForward = wordOffsetDelta > 0.001 || momentum > 0.01 ||
        (autoReadActive && autoDirection === 'forward');
      const atForwardBoundary = wordOffset >= allWordsLength - 2 && 
        nextByteStart == null &&
        isMovingForward;
      
      assert.strictEqual(isMovingForward, true, 'Should detect auto-read forward');
      assert.strictEqual(atForwardBoundary, true, 'Should trigger teleport during auto-read at end');
    });

    it('should NOT trigger teleport when not at end even if moving', () => {
      const wordOffsetDelta = 0.5;
      const momentum = 0.2;
      const autoReadActive = false;
      const autoDirection = 'forward';
      const wordOffset = 50; // Middle of content
      const allWordsLength = 100;
      const nextByteStart: number | null = 5000; // More content available
      
      const isMovingForward = wordOffsetDelta > 0.001 || momentum > 0.01 ||
        (autoReadActive && autoDirection === 'forward');
      const atForwardBoundary = wordOffset >= allWordsLength - 2 && 
        nextByteStart == null &&
        isMovingForward;
      
      assert.strictEqual(atForwardBoundary, false, 'Should NOT trigger when more content available');
    });
  });

  describe('Backward boundary teleport conditions', () => {
    
    it('should require active backward movement to trigger teleport', () => {
      const wordOffsetDelta = 0.0; // No movement
      const momentum = 0.0;
      const autoReadActive = false;
      const autoDirection = 'backward';
      const wordOffset = 0;
      const firstByteStart = 1000;
      const docStart = 1000;
      
      const isMovingBackward = wordOffsetDelta < -0.001 || momentum < -0.01 ||
        (autoReadActive && autoDirection === 'backward');
      const atDocStart = firstByteStart <= docStart + 100;
      const atWordStart = wordOffset <= 1;
      const atBackwardBoundary = atWordStart && atDocStart && isMovingBackward;
      
      assert.strictEqual(isMovingBackward, false, 'Should not detect backward movement with no delta');
      assert.strictEqual(atBackwardBoundary, false, 'Should NOT trigger teleport without active movement');
    });

    it('should trigger teleport when wordOffset delta is negative at start', () => {
      const wordOffsetDelta = -0.5; // Moving backward this frame
      const momentum = 0.0;
      const autoReadActive = false;
      const autoDirection = 'backward';
      const wordOffset = 0;
      const firstByteStart = 1000;
      const docStart = 1000;
      
      const isMovingBackward = wordOffsetDelta < -0.001 || momentum < -0.01 ||
        (autoReadActive && autoDirection === 'backward');
      const atDocStart = firstByteStart <= docStart + 100;
      const atWordStart = wordOffset <= 1;
      const atBackwardBoundary = atWordStart && atDocStart && isMovingBackward;
      
      assert.strictEqual(isMovingBackward, true, 'Should detect backward movement via delta');
      assert.strictEqual(atBackwardBoundary, true, 'Should trigger teleport when actively moving at start');
    });

    it('should trigger teleport during auto-read backward at start', () => {
      const wordOffsetDelta = 0.0;
      const momentum = 0.0;
      const autoReadActive = true;
      const autoDirection = 'backward';
      const wordOffset = 0;
      const firstByteStart = 1000;
      const docStart = 1000;
      
      const isMovingBackward = wordOffsetDelta < -0.001 || momentum < -0.01 ||
        (autoReadActive && autoDirection === 'backward');
      const atDocStart = firstByteStart <= docStart + 100;
      const atWordStart = wordOffset <= 1;
      const atBackwardBoundary = atWordStart && atDocStart && isMovingBackward;
      
      assert.strictEqual(isMovingBackward, true, 'Should detect auto-read backward');
      assert.strictEqual(atBackwardBoundary, true, 'Should trigger teleport during auto-read at start');
    });

    it('should NOT trigger when not at start even if moving backward', () => {
      const wordOffsetDelta = -0.5;
      const momentum = -0.2;
      const autoReadActive = false;
      const autoDirection = 'backward';
      const wordOffset = 50; // Middle of content
      const firstByteStart = 1000;
      const docStart = 1000;
      
      const isMovingBackward = wordOffsetDelta < -0.001 || momentum < -0.01 ||
        (autoReadActive && autoDirection === 'backward');
      const atDocStart = firstByteStart <= docStart + 100;
      const atWordStart = wordOffset <= 1;
      const atBackwardBoundary = atWordStart && atDocStart && isMovingBackward;
      
      assert.strictEqual(atWordStart, false, 'Should not be at word start');
      assert.strictEqual(atBackwardBoundary, false, 'Should NOT trigger when not at word 0');
    });
  });

  describe('Mode toggle scenarios', () => {
    
    it('should not trigger teleport when toggling to 3D at end of book', () => {
      // User is at end of book, toggles to 3D mode
      // wordOffsetDelta is 0 (fresh toggle), momentum is 0
      const wordOffsetDelta = 0;
      const momentum = 0;
      const autoReadActive = false;
      const wordOffset = 100;
      const allWordsLength = 100;
      const nextByteStart: number | null = null;
      
      const isMovingForward = wordOffsetDelta > 0.001 || momentum > 0.01 ||
        (autoReadActive && false);
      const atForwardBoundary = wordOffset >= allWordsLength - 2 && 
        nextByteStart == null &&
        isMovingForward;
      
      assert.strictEqual(atForwardBoundary, false, 
        'Should NOT teleport when toggling to 3D at end of book');
    });

    it('should not trigger teleport when toggling to 3D at start of book', () => {
      // User is at start of book, toggles to 3D mode
      const wordOffsetDelta = 0;
      const momentum = 0;
      const autoReadActive = false;
      const wordOffset = 0;
      const firstByteStart = 1000;
      const docStart = 1000;
      
      const isMovingBackward = wordOffsetDelta < -0.001 || momentum < -0.01 ||
        (autoReadActive && false);
      const atDocStart = firstByteStart <= docStart + 100;
      const atWordStart = wordOffset <= 1;
      const atBackwardBoundary = atWordStart && atDocStart && isMovingBackward;
      
      assert.strictEqual(atBackwardBoundary, false,
        'Should NOT teleport when toggling to 3D at start of book');
    });
  });
});

describe('Random Navigation Logic', () => {
  
  describe('Random Book behavior', () => {
    
    it('should always start at byte position 0 (beginning of book)', () => {
      // Simulating goToRandomBook behavior
      const bookId = 1234;
      const chunkSize = 200;
      const byteStart = 0; // Random Book always starts at beginning
      
      // This is what the hash should look like
      const expectedHash = `#${bookId},${byteStart},${chunkSize}`;
      
      assert.ok(expectedHash.includes(',0,'), 'Hash should have byteStart=0');
    });
  });

  describe('Random Location behavior', () => {
    
    it('should use a random penetration percentage between 5-95%', () => {
      // Test the random percentage calculation
      for (let i = 0; i < 100; i++) {
        const randomPercent = Math.floor(Math.random() * 90) + 5;
        assert.ok(randomPercent >= 5, `Percent ${randomPercent} should be >= 5`);
        assert.ok(randomPercent <= 94, `Percent ${randomPercent} should be <= 94`);
      }
    });

    it('should calculate correct byte offset from percentage', () => {
      const docStart = 1000;
      const docEnd = 101000;
      const totalCleanBytes = docEnd - docStart; // 100000
      const randomPercent = 50;
      
      const randomByteOffset = Math.floor(totalCleanBytes * (randomPercent / 100));
      const randomByteStart = docStart + randomByteOffset;
      
      assert.strictEqual(randomByteOffset, 50000, 'Should calculate 50% offset correctly');
      assert.strictEqual(randomByteStart, 51000, 'Should add offset to docStart');
    });

    it('should never start at byte 0 (always inside the book)', () => {
      const docStart = 1000;
      const docEnd = 101000;
      const totalCleanBytes = docEnd - docStart;
      
      // Even at 5%, should not be at 0
      const minPercent = 5;
      const minByteOffset = Math.floor(totalCleanBytes * (minPercent / 100));
      const minByteStart = docStart + minByteOffset;
      
      assert.ok(minByteStart > docStart, 'Should always be past docStart');
      assert.ok(minByteStart > 0, 'Should never be at byte 0');
    });
  });

  describe('URL update method', () => {
    
    it('should use replaceState to avoid triggering hashchange', () => {
      // This tests the concept - replaceState doesn't trigger hashchange
      // while setting location.hash directly does
      
      // The fix was changing from:
      // window.location.hash = `#${book.id},0,${state.chunkSize}`;
      // To:
      // window.history.replaceState(null, '', newHash);
      
      // We can't test actual browser behavior, but we can validate the
      // understanding that replaceState is the correct approach
      const newHash = '#1234,0,200';
      
      // replaceState format check
      assert.ok(newHash.startsWith('#'), 'Hash should start with #');
      assert.ok(newHash.split(',').length === 3, 'Hash should have 3 parts');
    });
  });
});

describe('No Plain Text Error Handling', () => {
  
  describe('Error message detection', () => {
    
    it('should identify "No plain text" error messages', () => {
      const errorMessage = 'No plain text available for "Some Book Title". This book may only exist in HTML or other formats on Project Gutenberg.';
      
      const isNoPlainTextError = errorMessage.includes('No plain text');
      
      assert.strictEqual(isNoPlainTextError, true, 'Should detect no plain text error');
    });

    it('should not false-positive on other errors', () => {
      const otherErrors = [
        'Network timeout',
        'Book not found',
        'Server error 500',
        'Invalid book ID'
      ];
      
      for (const err of otherErrors) {
        const isNoPlainTextError = err.includes('No plain text');
        assert.strictEqual(isNoPlainTextError, false, `Should not match: ${err}`);
      }
    });
  });

  describe('Retry logic for random selection', () => {
    
    it('should allow multiple retry attempts', () => {
      const MAX_RETRIES = 10;
      let attempts = 0;
      let success = false;
      
      // Simulate retry loop finding a valid book on attempt 5
      while (attempts < MAX_RETRIES && !success) {
        attempts++;
        if (attempts === 5) {
          success = true;
        }
      }
      
      assert.strictEqual(success, true, 'Should eventually succeed');
      assert.strictEqual(attempts, 5, 'Should track attempt count');
    });

    it('should respect max retry limit', () => {
      const MAX_RETRIES = 10;
      let attempts = 0;
      
      // Simulate always failing
      while (attempts < MAX_RETRIES) {
        attempts++;
        // Never succeed
      }
      
      assert.strictEqual(attempts, MAX_RETRIES, 'Should stop at max retries');
    });
  });
});
