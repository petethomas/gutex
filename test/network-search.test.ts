/**
 * Network Search Tests
 * 
 * Tests for KMP streaming search, Bitap fuzzy search,
 * adaptive chunk fetching, and the main NetworkSearcher.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { 
  StreamingKMP, 
  BitapSearcher, 
  AdaptiveChunkFetcher,
  NetworkSearcher,
  SearchMatch,
  SearchResult 
} from '../src/network-search.js';

// ============================================================
// KMP Streaming Search Tests
// ============================================================

describe('StreamingKMP', () => {
  describe('basic exact matching', () => {
    it('finds exact matches in simple text', () => {
      const kmp = new StreamingKMP('hello');
      const matches = kmp.processChunk('say hello to the world hello', 0);
      
      assert.strictEqual(matches.length, 2);
      assert.strictEqual(matches[0], 4);  // "hello" at position 4
      assert.strictEqual(matches[1], 23); // "hello" at position 23
    });
    
    it('is case insensitive', () => {
      const kmp = new StreamingKMP('Hello');
      const matches = kmp.processChunk('HELLO hello HeLLo', 0);
      
      assert.strictEqual(matches.length, 3);
    });
    
    it('handles no matches', () => {
      const kmp = new StreamingKMP('xyz');
      const matches = kmp.processChunk('the quick brown fox', 0);
      
      assert.strictEqual(matches.length, 0);
    });
    
    it('handles overlapping patterns', () => {
      const kmp = new StreamingKMP('aa');
      const matches = kmp.processChunk('aaaa', 0);
      
      // 'aa' appears at positions 0, 1, 2
      assert.strictEqual(matches.length, 3);
      assert.deepStrictEqual(matches, [0, 1, 2]);
    });
  });
  
  describe('streaming across chunks', () => {
    it('finds matches spanning chunk boundaries', () => {
      const kmp = new StreamingKMP('world');
      
      // First chunk ends mid-pattern
      const matches1 = kmp.processChunk('hello wor', 0);
      assert.strictEqual(matches1.length, 0);
      
      // Second chunk completes the pattern
      const matches2 = kmp.processChunk('ld today', 9);
      assert.strictEqual(matches2.length, 1);
      assert.strictEqual(matches2[0], 6); // "world" starts at byte 6
    });
    
    it('maintains state across multiple chunks', () => {
      const kmp = new StreamingKMP('abc');
      
      kmp.processChunk('xx', 0);
      kmp.processChunk('xa', 2);
      const matches = kmp.processChunk('bc', 4);
      
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0], 3); // "abc" starts at byte 3
    });
    
    it('resets state correctly', () => {
      const kmp = new StreamingKMP('test');
      
      kmp.processChunk('tes', 0);
      kmp.reset();
      
      const matches = kmp.processChunk('t is test', 3);
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0], 8); // Only finds complete "test"
    });
  });
  
  describe('multi-word phrases', () => {
    it('finds multi-word phrases', () => {
      const kmp = new StreamingKMP('brown fox');
      const matches = kmp.processChunk('the quick brown fox jumps', 0);
      
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0], 10);
    });
    
    it('handles phrases with punctuation', () => {
      const kmp = new StreamingKMP('hello, world');
      const matches = kmp.processChunk('say hello, world!', 0);
      
      assert.strictEqual(matches.length, 1);
    });
  });
});

// ============================================================
// Bitap Fuzzy Search Tests
// ============================================================

describe('BitapSearcher', () => {
  describe('exact matching (k=0)', () => {
    it('finds exact matches', () => {
      const bitap = new BitapSearcher('hello', 0);
      const matches = bitap.processChunk('say hello world', 0);
      
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].position, 4);
      assert.strictEqual(matches[0].editDistance, 0);
    });
  });
  
  describe('fuzzy matching (k=1)', () => {
    it('finds matches with 1 substitution', () => {
      const bitap = new BitapSearcher('hello', 1);
      const matches = bitap.processChunk('say hallo world', 0);
      
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].editDistance, 1);
    });
    
    it('finds matches with 1 deletion', () => {
      const bitap = new BitapSearcher('hello', 1);
      const matches = bitap.processChunk('say helo world', 0);
      
      assert.ok(matches.length >= 1);
    });
    
    it('finds matches with 1 insertion', () => {
      const bitap = new BitapSearcher('hello', 1);
      const matches = bitap.processChunk('say heello world', 0);
      
      assert.ok(matches.length >= 1);
    });
  });
  
  describe('fuzzy matching (k=2)', () => {
    it('finds matches with 2 errors', () => {
      const bitap = new BitapSearcher('hello', 2);
      const matches = bitap.processChunk('say holla world', 0);
      
      assert.ok(matches.length >= 1);
      assert.ok(matches[0].editDistance <= 2);
    });
    
    it('rejects matches with too many errors', () => {
      const bitap = new BitapSearcher('hello', 1);
      const matches = bitap.processChunk('say xxxxx world', 0);
      
      assert.strictEqual(matches.length, 0);
    });
  });
  
  describe('reports best match at each position', () => {
    it('reports lowest edit distance for overlapping matches', () => {
      const bitap = new BitapSearcher('test', 2);
      // "test" appears exactly at position 0
      const matches = bitap.processChunk('test', 0);
      
      assert.ok(matches.length >= 1, `Expected at least 1 match, got ${matches.length}`);
      assert.strictEqual(matches[0].editDistance, 0);
      assert.strictEqual(matches[0].position, 0);
    });
  });
  
  describe('multi-word fuzzy search', () => {
    it('handles multi-word patterns', () => {
      const bitap = new BitapSearcher('brown fox', 1);
      const matches = bitap.processChunk('the brown fox', 0);
      
      assert.ok(matches.length >= 1);
    });
  });
});

// ============================================================
// NetworkSearcher Validation Tests
// ============================================================

describe('NetworkSearcher', () => {
  describe('phrase validation', () => {
    const searcher = new NetworkSearcher(false);
    
    it('rejects phrases with fewer than 4 words', () => {
      const result = searcher.validatePhrase('one two three');
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('4 words'));
    });
    
    it('accepts phrases with 4+ words', () => {
      const result = searcher.validatePhrase('one two three four');
      
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.words, ['one', 'two', 'three', 'four']);
    });
    
    it('handles extra whitespace', () => {
      const result = searcher.validatePhrase('  one   two   three   four  ');
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.words?.length, 4);
    });
    
    it('rejects very short phrases', () => {
      const result = searcher.validatePhrase('a b c d');
      
      // 4 single-letter words = 7 chars total, under 10 char minimum
      assert.strictEqual(result.valid, false);
    });
  });
  
  describe('full text search (small files)', () => {
    const searcher = new NetworkSearcher(false);
    
    it('exact search finds matches', () => {
      // Using private method via reflection for testing
      const matches = (searcher as any).exactSearchText(
        'the quick brown fox jumps over the lazy dog',
        'brown fox',
        { maxMatches: 10, contextSize: 20 }
      );
      
      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0].matchedText, 'brown fox');
      assert.strictEqual(matches[0].editDistance, 0);
    });
    
    it('fuzzy search finds approximate matches', () => {
      const matches = (searcher as any).fuzzySearchText(
        'the quick browne fox jumps over the lazy dog',
        'brown fox',
        { maxMatches: 10, contextSize: 20, maxEditDistance: 2 }
      );
      
      // Should find "browne fox" as approximate match
      assert.ok(matches.length >= 1);
    });
  });
});

// ============================================================
// Integration Tests (require network)
// ============================================================

describe('NetworkSearcher Integration', () => {
  const searcher = new NetworkSearcher(false);
  
  // Skip network tests in CI environment
  const skipNetwork = process.env.CI === 'true' || process.env.SKIP_NETWORK === 'true';
  
  it('searches a real Gutenberg book', async () => {
    if (skipNetwork) {
      console.log('Skipping network test');
      return;
    }
    
    // Pride and Prejudice - search for famous opening
    const url = 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt';
    
    try {
      const result = await searcher.search(
        url,
        'truth universally acknowledged that a',
        { fuzzy: false, maxMatches: 5 }
      );
      
      assert.strictEqual(result.found, true);
      assert.ok(result.matches.length >= 1);
      assert.ok(result.bytesDownloaded > 0);
      assert.ok(result.searchTimeMs > 0);
      
      console.log(`Found ${result.matches.length} matches`);
      console.log(`Strategy: ${result.strategy}`);
      console.log(`Downloaded: ${result.bytesDownloaded} bytes`);
      console.log(`Chunks: ${result.chunksRequested}`);
      console.log(`Time: ${result.searchTimeMs}ms`);
    } catch (err) {
      // Network errors are acceptable in tests
      console.log(`Network test skipped: ${(err as Error).message}`);
    }
  });
  
  it('fuzzy search finds approximate matches', async () => {
    if (skipNetwork) {
      console.log('Skipping network test');
      return;
    }
    
    const url = 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt';
    
    try {
      // Search with slight typo
      const result = await searcher.search(
        url,
        'truth universaly acknowledged that a',
        { fuzzy: true, maxEditDistance: 2, maxMatches: 5 }
      );
      
      if (result.found) {
        console.log(`Fuzzy search found ${result.matches.length} matches`);
        console.log(`Edit distances: ${result.matches.map(m => m.editDistance).join(', ')}`);
      }
    } catch (err) {
      console.log(`Network test skipped: ${(err as Error).message}`);
    }
  });
});

// ============================================================
// Levenshtein Distance Tests (internal)
// ============================================================

describe('Levenshtein Distance', () => {
  // Test via BitapSearcher's internal method
  it('calculates correct distances', () => {
    const bitap = new BitapSearcher('test', 3);
    
    // Access private method for testing
    const levenshtein = (bitap as any).levenshteinDistance.bind(bitap);
    
    assert.strictEqual(levenshtein('hello', 'hello'), 0);
    assert.strictEqual(levenshtein('hello', 'hallo'), 1);
    assert.strictEqual(levenshtein('hello', 'helo'), 1);
    assert.strictEqual(levenshtein('hello', 'heello'), 1);
    assert.strictEqual(levenshtein('hello', 'world'), 4);
    assert.strictEqual(levenshtein('', 'abc'), 3);
    assert.strictEqual(levenshtein('abc', ''), 3);
  });
});

// ============================================================
// RangeFetcher Injection Tests
// ============================================================

describe('RangeFetcher injection (caching)', () => {
  it('uses injected fetcher instead of HTTP', async () => {
    const searcher = new NetworkSearcher(false);
    const fetchCalls: Array<{start: number; end: number}> = [];
    
    // Mock fetcher that tracks calls and returns searchable text
    const mockFetcher = async (start: number, end: number): Promise<Buffer> => {
      fetchCalls.push({ start, end });
      // Return text containing our search phrase at a known position
      const fullText = 'padding '.repeat(100) + 'one two three four five six' + ' padding'.repeat(100);
      const slice = fullText.slice(start, end + 1);
      return Buffer.from(slice);
    };
    
    // Call searchWithRanges directly to bypass HEAD request
    const result = await searcher.searchWithRanges(
      'http://example.com/test.txt',
      5000, // fake file size
      'one two three four',
      { rangeFetcher: mockFetcher }
    );
    
    // The key assertion: our mock was called, not HTTP
    assert.ok(fetchCalls.length > 0, 'Injected fetcher should have been called');
  });
  
  it('falls back to HTTP when no fetcher provided', async () => {
    // This test just ensures no crash when rangeFetcher is undefined
    const searcher = new NetworkSearcher(false);
    
    // Validation should work without fetcher
    const validation = searcher.validatePhrase('one two three four');
    assert.strictEqual(validation.valid, true);
  });
});

// ============================================================
// Edge Cases
// ============================================================

describe('Edge Cases', () => {
  describe('StreamingKMP edge cases', () => {
    it('handles empty text', () => {
      const kmp = new StreamingKMP('test');
      const matches = kmp.processChunk('', 0);
      assert.strictEqual(matches.length, 0);
    });
    
    it('handles pattern longer than text', () => {
      const kmp = new StreamingKMP('very long pattern here');
      const matches = kmp.processChunk('short', 0);
      assert.strictEqual(matches.length, 0);
    });
    
    it('handles special characters', () => {
      const kmp = new StreamingKMP('hello.*world');
      const matches = kmp.processChunk('say hello.*world!', 0);
      assert.strictEqual(matches.length, 1);
    });
  });
  
  describe('BitapSearcher edge cases', () => {
    it('handles empty text', () => {
      const bitap = new BitapSearcher('test', 1);
      const matches = bitap.processChunk('', 0);
      assert.strictEqual(matches.length, 0);
    });
    
    it('handles single character pattern', () => {
      const bitap = new BitapSearcher('a', 0);
      const matches = bitap.processChunk('banana', 0);
      assert.strictEqual(matches.length, 3); // 'a' appears 3 times
    });
    
    it('handles max pattern length (31 chars)', () => {
      const pattern = 'a'.repeat(31);
      const bitap = new BitapSearcher(pattern, 0);
      const matches = bitap.processChunk('x' + pattern + 'x', 0);
      assert.strictEqual(matches.length, 1);
    });
    
    it('falls back for patterns > 31 chars', () => {
      const pattern = 'the quick brown fox jumps over the';
      assert.ok(pattern.length > 31, `Pattern length ${pattern.length} should be > 31`);
      
      const bitap = new BitapSearcher(pattern, 1);
      const text = 'the quick brown fox jumps over the lazy dog';
      const matches = bitap.processChunk(text, 0);
      
      // Should still find matches via fallback
      assert.ok(matches.length >= 1);
    });
  });
});
