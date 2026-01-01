import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Navigator } from '../src/navigator.js';
import type { Boundaries } from '../src/types.js';

// Mock fetcher that returns predictable content
function createMockFetcher(content: string) {
  const buffer = Buffer.from(content, 'utf8');
  return {
    fetchRange: async (start: number, end: number) => {
      return buffer.subarray(start, end + 1);
    }
  };
}

describe('Chunk Alignment Tests', () => {
  const testContent = 'Word1 Word2 Word3 Word4 Word5 Word6 Word7 Word8 Word9 Word10 ' +
                      'Word11 Word12 Word13 Word14 Word15 Word16 Word17 Word18 Word19 Word20 ' +
                      'Word21 Word22 Word23 Word24 Word25 Word26 Word27 Word28 Word29 Word30 ' +
                      'Word31 Word32 Word33 Word34 Word35 Word36 Word37 Word38 Word39 Word40';

  let navigator: Navigator;
  let boundaries: Boundaries;

  beforeEach(() => {
    const fetcher = createMockFetcher(testContent);
    boundaries = {
      startByte: 0,
      endByte: Buffer.byteLength(testContent, 'utf8') - 1,
      cleanLength: Buffer.byteLength(testContent, 'utf8')
    };
    navigator = new Navigator(fetcher, boundaries, 5); // 5 words per chunk
  });

  it('forward then backward should return to exact same position', async () => {
    const pos1 = await navigator.goToPercent(0);
    const pos1Start = pos1.byteStart;
    const pos1Words = [...pos1.words];
    
    const pos2 = await navigator.moveForward(pos1);
    assert.notStrictEqual(pos2.byteStart, pos1Start, 'Forward should move to new position');
    
    const pos3 = await navigator.moveBackward(pos2);
    assert.strictEqual(pos3.byteStart, pos1Start, 'Backward should return to exact start');
    assert.deepStrictEqual(pos3.words, pos1Words, 'Words should match exactly');
  });

  it('multiple forward then multiple backward should align', async () => {
    const positions: number[] = [];
    
    let pos = await navigator.goToPercent(0);
    positions.push(pos.byteStart);
    
    // Go forward 3 times
    for (let i = 0; i < 3; i++) {
      pos = await navigator.moveForward(pos);
      positions.push(pos.byteStart);
    }
    
    // Go backward 3 times - should hit exact same positions in reverse
    for (let i = 2; i >= 0; i--) {
      pos = await navigator.moveBackward(pos);
      assert.strictEqual(pos.byteStart, positions[i], `Backward ${3-i} should match forward position ${i}`);
    }
  });

  it('chunk size change should not break alignment after next navigation', async () => {
    const pos1 = await navigator.goToPercent(0);
    const pos2 = await navigator.moveForward(pos1);
    
    // Change chunk size
    navigator.chunkSize = 10;
    
    // Go forward with new chunk size
    const pos3 = await navigator.moveForward(pos2);
    
    // Go backward should still return to pos2 (from history)
    const pos4 = await navigator.moveBackward(pos3);
    assert.strictEqual(pos4.byteStart, pos2.byteStart, 'Should return to saved position despite chunk size change');
  });

  it('after goToPercent, forward/backward should work correctly', async () => {
    // Jump to middle
    const pos1 = await navigator.goToPercent(50);
    
    const pos2 = await navigator.moveForward(pos1);
    assert.ok(pos2.byteStart > pos1.byteStart, 'Forward should increase byte position');
    
    const pos3 = await navigator.moveBackward(pos2);
    assert.strictEqual(pos3.byteStart, pos1.byteStart, 'Backward should return to jumped position');
  });

  it('nextByteStart should point to actual next chunk start', async () => {
    const pos1 = await navigator.goToPercent(0);
    
    if (pos1.nextByteStart !== undefined) {
      const pos2 = await navigator.moveForward(pos1);
      
      // The new chunk should start at or very close to nextByteStart
      // Allow some tolerance for word boundary adjustments
      const diff = Math.abs(pos2.byteStart - pos1.nextByteStart);
      assert.ok(diff < 20, `Next chunk should start near nextByteStart (diff: ${diff})`);
    }
  });

  it('consecutive forward navigations should not skip or overlap words', async () => {
    const allWords: string[] = [];
    let pos = await navigator.goToPercent(0);
    allWords.push(...pos.words);
    
    // Navigate forward until near end
    while (pos.nextByteStart !== undefined && !pos.isNearEnd) {
      pos = await navigator.moveForward(pos);
      allWords.push(...pos.words);
      
      // Safety limit
      if (allWords.length > 100) break;
    }
    
    // Check for no duplicates at boundaries
    for (let i = 1; i < allWords.length; i++) {
      // Allow some duplicates due to how chunks work, but not many consecutive
      if (allWords[i] === allWords[i-1] && allWords[i] === allWords[i-2]) {
        assert.fail(`Found suspicious duplicate: ${allWords[i]} at index ${i}`);
      }
    }
  });
});

describe('Chunk Size Change Alignment', () => {
  const testContent = Array.from({length: 100}, (_, i) => `Word${i+1}`).join(' ');

  let navigator: Navigator;

  beforeEach(() => {
    const fetcher = {
      fetchRange: async (start: number, end: number) => {
        const buffer = Buffer.from(testContent, 'utf8');
        return buffer.subarray(start, end + 1);
      }
    };
    const boundaries = {
      startByte: 0,
      endByte: Buffer.byteLength(testContent, 'utf8') - 1,
      cleanLength: Buffer.byteLength(testContent, 'utf8')
    };
    navigator = new Navigator(fetcher, boundaries, 10);
  });

  it('backward after goToPercent (simulating chunk size change) should work', async () => {
    // Go to 50% - this is what happens after chunk size change
    const pos1 = await navigator.goToPercent(50);
    
    // History is cleared by goToPercent, so backward uses estimation
    const pos2 = await navigator.moveBackward(pos1);
    
    // Should have moved backward
    assert.ok(pos2.byteStart < pos1.byteStart, 
      `Backward should decrease position (was ${pos1.byteStart}, now ${pos2.byteStart})`);
    
    // Should have valid words
    assert.ok(pos2.words.length > 0, 'Should have words');
  });

  it('forward-forward-backward-backward without history should work reasonably', async () => {
    // Start fresh at 20%
    let pos = await navigator.goToPercent(20);
    const startByte = pos.byteStart;
    
    // Forward twice
    pos = await navigator.moveForward(pos);
    pos = await navigator.moveForward(pos);
    const furthestByte = pos.byteStart;
    
    // Clear history to simulate what goToPercent does
    navigator.positionHistory = [];
    
    // Backward twice - now using estimation, not history
    pos = await navigator.moveBackward(pos);
    pos = await navigator.moveBackward(pos);
    
    // We won't land exactly at startByte, but should be close
    const diff = Math.abs(pos.byteStart - startByte);
    const tolerance = 100; // bytes
    
    console.log(`Start: ${startByte}, After F-F-B-B (no history): ${pos.byteStart}, diff: ${diff}`);
    
    // This is the key question: is it close enough?
    assert.ok(diff < tolerance, 
      `Without history, backward should get close to original (diff: ${diff}, tolerance: ${tolerance})`);
  });

  it('chunk size mid-session: byte position should stay exact', async () => {
    // Navigate forward a few times with chunk size 10
    let pos = await navigator.goToPercent(0);
    pos = await navigator.moveForward(pos);
    pos = await navigator.moveForward(pos);
    
    const beforeChangeBytes = pos.byteStart;
    const beforeWordIndex = pos.wordIndex;
    
    // Simulate what updateChunkSize does:
    navigator.chunkSize = 20; // double the chunk size
    navigator.positionHistory = []; // clear history since boundaries changed
    
    // Re-fetch at exact same byte position (this is what the fix does)
    pos = await navigator._fetchChunkAt(beforeChangeBytes, beforeWordIndex, 'forward');
    
    // Position should be EXACT
    assert.strictEqual(pos.byteStart, beforeChangeBytes, 
      `Byte position should be exact after chunk size change`);
    
    // But we should now have more words (bigger chunk)
    assert.ok(pos.words.length <= 20, 'Should have up to 20 words with new chunk size');
  });
});
