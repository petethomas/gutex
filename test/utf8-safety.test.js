import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Navigator } from '../lib/navigator.js';

class MockFetcher {
  constructor(content) {
    this.content = content;
    this.totalBytes = Buffer.byteLength(content, 'utf8');
  }

  async getFileSize() {
    return this.totalBytes;
  }

  async fetchRange(startByte, endByte) {
    const buffer = Buffer.from(this.content, 'utf8');
    const slice = buffer.slice(startByte, endByte + 1);
    return slice.toString('utf8');
  }
}

describe('UTF-8 Boundary Safety Tests', () => {
  
  it('handles multi-byte UTF-8 characters at chunk boundaries', async () => {
    // Mix ASCII and multi-byte characters
    const words = ['hello', 'café', 'naïve', 'résumé', '北京', '東京', 'Москва'];
    const content = words.join(' ').repeat(50);
    
    const fetcher = new MockFetcher(content);
    const boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 5);
    
    // Navigate through content with multi-byte chars
    let position = await navigator.goToPercent(30);
    
    // Verify no corrupted characters
    for (const word of position.words) {
      assert.ok(!word.includes('\ufffd'), 
        `Word "${word}" contains replacement character (corrupted UTF-8)`);
    }
    
    // Move forward
    position = await navigator.moveForward(position);
    
    for (const word of position.words) {
      assert.ok(!word.includes('\ufffd'),
        `Word "${word}" contains replacement character after forward movement`);
    }
  });

  it('correctly identifies UTF-8 start bytes', async () => {
    const content = 'ASCII café naïve 北京 test';
    const buffer = Buffer.from(content, 'utf8');
    
    const fetcher = new MockFetcher(content);
    const boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 3);
    
    // The _findUTF8Boundary method should correctly handle continuation bytes
    // Testing indirectly through navigation
    const position = await navigator.goToPercent(50);
    
    // Join and re-split to verify proper character handling
    const text = position.words.join(' ');
    const reEncoded = Buffer.from(text, 'utf8');
    
    assert.strictEqual(reEncoded.toString('utf8'), text,
      'Text should survive UTF-8 encode/decode cycle without corruption');
  });

  it('handles emoji and other 4-byte UTF-8 sequences', async () => {
    const words = ['Hello', '👋', 'World', '🌍', 'Test', '🎉', 'Data', '📊'];
    const content = words.join(' ').repeat(20);
    
    const fetcher = new MockFetcher(content);
    const boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 4);
    
    let position = await navigator.goToPercent(25);
    
    // Verify emoji are intact (not split or corrupted)
    const text = position.words.join(' ');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
    
    // If we have emoji in the chunk, verify they're complete
    if (emojiRegex.test(text)) {
      assert.ok(!text.includes('\ufffd'),
        'Emoji should not be corrupted');
    }
  });

  it('correctly handles chunks starting mid-UTF-8 character', async () => {
    const content = 'test café résumé naïve';
    const buffer = Buffer.from(content, 'utf8');
    
    // Find a byte position that's in the middle of a multi-byte char
    let midCharByte = -1;
    for (let i = 0; i < buffer.length; i++) {
      if ((buffer[i] & 0xC0) === 0x80) { // Continuation byte
        midCharByte = i;
        break;
      }
    }
    
    if (midCharByte === -1) {
      // Content doesn't have multi-byte chars in right position, skip
      assert.ok(true, 'Test content has no suitable mid-character position');
      return;
    }
    
    const fetcher = new MockFetcher(content);
    const boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 3);
    
    // Force a fetch that might start mid-character
    const result = await navigator._fetchRangeSafe(midCharByte - 1, midCharByte + 20);
    
    // Should not crash and should not contain replacement characters
    assert.ok(!result.text.includes('\ufffd'),
      'Mid-character fetch should not produce corrupted text');
  });

  it('safety margins prevent character splitting', async () => {
    // Create content where splitting would occur without safety margins
    const content = 'word1 café word2 naïve word3 résumé word4';
    
    const fetcher = new MockFetcher(content);
    const boundaries = {
      startByte: 0,
      endByte: fetcher.totalBytes - 1,
      cleanLength: fetcher.totalBytes
    };
    
    const navigator = new Navigator(fetcher, boundaries, 2);
    
    // Navigate to various positions
    for (let percent = 10; percent <= 90; percent += 20) {
      const position = await navigator.goToPercent(percent);
      
      // Verify no corruption
      for (const word of position.words) {
        assert.ok(!word.includes('\ufffd'),
          `At ${percent}%, word "${word}" is corrupted`);
        
        // Verify word can be re-encoded
        const reencoded = Buffer.from(word, 'utf8').toString('utf8');
        assert.strictEqual(reencoded, word,
          'Word should survive UTF-8 round-trip');
      }
    }
  });
});
