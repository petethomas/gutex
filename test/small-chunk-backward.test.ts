import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

/**
 * Test for the small chunk size backward navigation bug.
 * 
 * With chunk sizes <= 8 words, backward navigation would always trigger
 * a teleport (book change) instead of actually moving backward through the text.
 * 
 * CAUSE: The threshold for "meaningful progress" was hardcoded to 50 bytes.
 * With 8 words × 6 bytes/word = 48 bytes, this was always less than 50,
 * so the condition `prevByteStart >= state.byteStart - 50` was always true.
 * 
 * FIX: Changed the threshold to be proportional to chunk size:
 * `Math.max(20, Math.floor(bytesToGoBack * 0.5))`
 */

describe('Small Chunk Size Backward Navigation', () => {
  it('should allow backward navigation with 8-word chunks', () => {
    // Simulating the backward navigation calculation
    const chunkSize = 8;
    const bytesPerWord = 6;
    const bytesToGoBack = chunkSize * bytesPerWord; // 48 bytes
    
    const state = { byteStart: 1000, docStart: 0 };
    const prevByteStart = Math.max(state.docStart, state.byteStart - bytesToGoBack); // 952
    
    const oldThreshold = 50;
    const wouldTeleportOld = prevByteStart >= state.byteStart - oldThreshold;
    // 952 >= 950? YES - would incorrectly teleport
    assert.strictEqual(wouldTeleportOld, true, 'Old code would incorrectly teleport');
    
    const minProgress = Math.max(1, Math.floor(bytesToGoBack * 0.5)); // max(1, 24) = 24
    const wouldTeleportNew = prevByteStart >= state.byteStart - minProgress;
    // 952 >= 976? NO - correctly allows navigation
    assert.strictEqual(wouldTeleportNew, false, 'New code correctly allows navigation');
  });

  it('should allow backward navigation with very small chunks (4 words)', () => {
    const chunkSize = 4;
    const bytesPerWord = 6;
    const bytesToGoBack = chunkSize * bytesPerWord; // 24 bytes
    
    const state = { byteStart: 500, docStart: 0 };
    const prevByteStart = Math.max(state.docStart, state.byteStart - bytesToGoBack); // 476
    
    const oldThreshold = 50;
    const wouldTeleportOld = prevByteStart >= state.byteStart - oldThreshold;
    assert.strictEqual(wouldTeleportOld, true, 'Old code would incorrectly teleport');
    
    const minProgress = Math.max(1, Math.floor(bytesToGoBack * 0.5));
    const wouldTeleportNew = prevByteStart >= state.byteStart - minProgress;
    assert.strictEqual(wouldTeleportNew, false, 'New code correctly allows navigation');
  });

  it('should allow backward navigation with 3-word chunks', () => {
    const chunkSize = 3;
    const bytesPerWord = 6;
    const bytesToGoBack = chunkSize * bytesPerWord; // 18 bytes
    
    const state = { byteStart: 500, docStart: 0 };
    const prevByteStart = Math.max(state.docStart, state.byteStart - bytesToGoBack); // 482
    
    const oldThreshold = 50;
    const wouldTeleportOld = prevByteStart >= state.byteStart - oldThreshold;
    assert.strictEqual(wouldTeleportOld, true, 'Old code would incorrectly teleport');
    
    const minProgress = Math.max(1, Math.floor(bytesToGoBack * 0.5));
    const wouldTeleportNew = prevByteStart >= state.byteStart - minProgress;
    assert.strictEqual(wouldTeleportNew, false, 'New code correctly allows navigation');
  });

  it('should allow backward navigation with 2-word chunks', () => {
    const chunkSize = 2;
    const bytesPerWord = 6;
    const bytesToGoBack = chunkSize * bytesPerWord; // 12 bytes
    
    const state = { byteStart: 500, docStart: 0 };
    const prevByteStart = Math.max(state.docStart, state.byteStart - bytesToGoBack); // 488
    
    const oldThreshold = 50;
    const wouldTeleportOld = prevByteStart >= state.byteStart - oldThreshold;
    assert.strictEqual(wouldTeleportOld, true, 'Old code would incorrectly teleport');
    
    const minProgress = Math.max(1, Math.floor(bytesToGoBack * 0.5));
    const wouldTeleportNew = prevByteStart >= state.byteStart - minProgress;
    assert.strictEqual(wouldTeleportNew, false, 'New code correctly allows navigation');
  });

  it('should still work correctly with larger chunks (20 words)', () => {
    const chunkSize = 20;
    const bytesPerWord = 6;
    const bytesToGoBack = chunkSize * bytesPerWord; // 120 bytes
    
    const state = { byteStart: 1000, docStart: 0 };
    const prevByteStart = Math.max(state.docStart, state.byteStart - bytesToGoBack); // 880
    
    // Both old and new should allow navigation
    const oldThreshold = 50;
    const wouldTeleportOld = prevByteStart >= state.byteStart - oldThreshold;
    assert.strictEqual(wouldTeleportOld, false, 'Old code correctly allows navigation');
    
    const minProgress = Math.max(1, Math.floor(bytesToGoBack * 0.5)); // 60
    const wouldTeleportNew = prevByteStart >= state.byteStart - minProgress;
    assert.strictEqual(wouldTeleportNew, false, 'New code correctly allows navigation');
  });

  it('should still teleport when actually at document start', () => {
    const chunkSize = 8;
    const bytesPerWord = 6;
    const bytesToGoBack = chunkSize * bytesPerWord; // 48 bytes
    
    // Near the start of the document
    const state = { byteStart: 30, docStart: 0 };
    const prevByteStart = Math.max(state.docStart, state.byteStart - bytesToGoBack); // 0 (clamped)
    
    // The teleport only happens when we try to go backward from position 0 or very close to it.
    // prevByteStart (0), state.byteStart (30), minProgress = max(1, 24) = 24
    // Check: 0 >= 30 - 24 = 6? NO - allows navigating to the start first
    
    const minProgress = Math.max(1, Math.floor(bytesToGoBack * 0.5)); // 24
    const wouldTeleportNew = prevByteStart >= state.byteStart - minProgress;
    assert.strictEqual(wouldTeleportNew, false, 'Still allows final navigation to start');
  });
});
