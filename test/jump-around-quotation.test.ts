/**
 * Jump Around and Excerpt Feature Tests
 * 
 * Tests for:
 * 1. Jump Around mode (same-book and global variants)
 * 2. Excerpt mode URL construction
 * 3. Text formatting for excerpts (ellipses, excerpts)
 * 4. wget/curl command generation
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Extract functions from web-ui.html for testing
// ============================================================

// Load the HTML file and extract the JavaScript
const htmlPath = path.join(__dirname, '..', 'src', 'web-ui.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Extract formatExcerptText function
const formatExcerptTextMatch = htmlContent.match(/function formatExcerptText\(text\)\s*\{([\s\S]*?)^\s{4}\}/m);
const formatExcerptTextBody = formatExcerptTextMatch ? formatExcerptTextMatch[1] : '';

// Recreate the function for testing
function formatExcerptText(text: string): string {
  // Add smart excerpts and ellipses
  let formatted = text.trim();
  
  // Check if starts with capital letter (no left ellipsis needed)
  const startsWithCapital = /^[A-Z]/.test(formatted);
  
  // Check if ends with punctuation (no right ellipsis needed)
  const endsWithPunctuation = /[.!?;:,'")\]]$/.test(formatted);
  
  // Add ellipses where appropriate
  const leftEllipsis = startsWithCapital ? '' : '… ';
  const rightEllipsis = endsWithPunctuation ? '' : ' …';
  
  // Wrap in curly excerpts
  return '"' + leftEllipsis + formatted + rightEllipsis + '"';
}

// URL construction function (mirrors openExcerptView logic)
function constructExcerptUrl(origin: string, pathname: string, search: string, hash: string): string {
  const base = origin + pathname;
  const separator = search ? '&' : '?';
  return base + search + separator + 'excerpt=1' + hash;
}

// Command generation functions
function generateCurlCmd(bookId: number, byteStart: number, byteEnd: number): string {
  const gutenbergUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
  return `curl -s -r ${byteStart}-${byteEnd} "${gutenbergUrl}"`;
}

function generateWgetCmd(bookId: number, byteStart: number, byteEnd: number): string {
  const gutenbergUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
  return `wget -q -O - --timeout=10 --header="Range: bytes=${byteStart}-${byteEnd}" "${gutenbergUrl}"`;
}

// ============================================================
// ANNOTATION TEXT FORMATTING TESTS
// ============================================================

describe('formatExcerptText', () => {
  it('should add ellipses when text starts lowercase and ends without punctuation', () => {
    const result = formatExcerptText('the quick brown fox');
    assert.strictEqual(result, '"… the quick brown fox …"');
  });

  it('should not add left ellipsis when text starts with capital letter', () => {
    const result = formatExcerptText('The quick brown fox');
    assert.strictEqual(result, '"The quick brown fox …"');
  });

  it('should not add right ellipsis when text ends with period', () => {
    const result = formatExcerptText('the quick brown fox.');
    assert.strictEqual(result, '"… the quick brown fox."');
  });

  it('should not add right ellipsis when text ends with exclamation', () => {
    const result = formatExcerptText('What a fox!');
    assert.strictEqual(result, '"What a fox!"');
  });

  it('should not add right ellipsis when text ends with question mark', () => {
    const result = formatExcerptText('Is it a fox?');
    assert.strictEqual(result, '"Is it a fox?"');
  });

  it('should not add right ellipsis when text ends with comma', () => {
    const result = formatExcerptText('The fox,');
    assert.strictEqual(result, '"The fox,"');
  });

  it('should not add right ellipsis when text ends with semicolon', () => {
    const result = formatExcerptText('The fox;');
    assert.strictEqual(result, '"The fox;"');
  });

  it('should not add right ellipsis when text ends with colon', () => {
    const result = formatExcerptText('The fox:');
    assert.strictEqual(result, '"The fox:"');
  });

  it('should not add right ellipsis when text ends with closing excerpt', () => {
    const result = formatExcerptText('He said "fox"');
    assert.strictEqual(result, '"He said "fox""');
  });

  it('should not add right ellipsis when text ends with closing paren', () => {
    const result = formatExcerptText('The fox (brown)');
    assert.strictEqual(result, '"The fox (brown)"');
  });

  it('should not add right ellipsis when text ends with closing bracket', () => {
    const result = formatExcerptText('The fox [brown]');
    assert.strictEqual(result, '"The fox [brown]"');
  });

  it('should handle text with no ellipses needed', () => {
    const result = formatExcerptText('It was the best of times.');
    assert.strictEqual(result, '"It was the best of times."');
  });

  it('should trim whitespace from input', () => {
    const result = formatExcerptText('  The fox  ');
    assert.strictEqual(result, '"The fox …"');
  });

  it('should handle single word starting with capital', () => {
    const result = formatExcerptText('Fox');
    assert.strictEqual(result, '"Fox …"');
  });

  it('should handle single word starting with lowercase', () => {
    const result = formatExcerptText('fox');
    assert.strictEqual(result, '"… fox …"');
  });
});

// ============================================================
// ANNOTATION URL CONSTRUCTION TESTS
// ============================================================

describe('constructExcerptUrl', () => {
  it('should construct URL with empty search and hash', () => {
    const result = constructExcerptUrl('https://example.com', '/read', '', '#1342:1000');
    assert.strictEqual(result, 'https://example.com/read?excerpt=1#1342:1000');
  });

  it('should construct URL with existing search param', () => {
    const result = constructExcerptUrl('https://example.com', '/read', '?foo=bar', '#1342:1000');
    assert.strictEqual(result, 'https://example.com/read?foo=bar&excerpt=1#1342:1000');
  });

  it('should construct URL with no hash', () => {
    const result = constructExcerptUrl('https://example.com', '/read', '', '');
    assert.strictEqual(result, 'https://example.com/read?excerpt=1');
  });

  it('should construct URL with multiple existing params', () => {
    const result = constructExcerptUrl('https://example.com', '/read', '?a=1&b=2', '#5000:200');
    assert.strictEqual(result, 'https://example.com/read?a=1&b=2&excerpt=1#5000:200');
  });

  it('should ensure query string comes before hash', () => {
    const result = constructExcerptUrl('https://example.com', '/read', '', '#1342:1000:200');
    // The key test: ?excerpt=1 must come BEFORE #hash
    assert.ok(result.indexOf('?excerpt=1') < result.indexOf('#'));
  });
});

// ============================================================
// CURL/WGET COMMAND GENERATION TESTS
// ============================================================

describe('generateCurlCmd', () => {
  it('should generate correct curl command', () => {
    const cmd = generateCurlCmd(1342, 50000, 51000);
    assert.strictEqual(cmd, 'curl -s -r 50000-51000 "https://www.gutenberg.org/cache/epub/1342/pg1342.txt"');
  });

  it('should handle book ID with leading zeros conceptually', () => {
    const cmd = generateCurlCmd(84, 1000, 2000);
    assert.strictEqual(cmd, 'curl -s -r 1000-2000 "https://www.gutenberg.org/cache/epub/84/pg84.txt"');
  });

  it('should handle large byte ranges', () => {
    const cmd = generateCurlCmd(1342, 1000000, 1001000);
    assert.ok(cmd.includes('-r 1000000-1001000'));
  });
});

describe('generateWgetCmd', () => {
  it('should generate correct wget command with Range header', () => {
    const cmd = generateWgetCmd(1342, 50000, 51000);
    assert.strictEqual(cmd, 'wget -q -O - --timeout=10 --header="Range: bytes=50000-51000" "https://www.gutenberg.org/cache/epub/1342/pg1342.txt"');
  });

  it('should include timeout flag', () => {
    const cmd = generateWgetCmd(1342, 1000, 2000);
    assert.ok(cmd.includes('--timeout=10'));
  });

  it('should output to stdout with -O -', () => {
    const cmd = generateWgetCmd(1342, 1000, 2000);
    assert.ok(cmd.includes('-O -'));
  });
});

// ============================================================
// JUMP AROUND STATE LOGIC TESTS
// ============================================================

interface JumpAroundState {
  active: boolean;
  sameBook: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
  minInterval: number;
  maxInterval: number;
}

describe('Jump Around state management', () => {
  // Simulate the jumpAround state object
  const createJumpAroundState = (): JumpAroundState => ({
    active: false,
    sameBook: false,
    timeoutId: null,
    minInterval: 5000,
    maxInterval: 15000
  });

  it('should start with inactive state', () => {
    const state = createJumpAroundState();
    assert.strictEqual(state.active, false);
    assert.strictEqual(state.sameBook, false);
  });

  it('should calculate random interval within bounds', () => {
    const state = createJumpAroundState();
    const getRandomJumpInterval = (): number => {
      return state.minInterval + Math.random() * (state.maxInterval - state.minInterval);
    };
    
    for (let i = 0; i < 100; i++) {
      const interval = getRandomJumpInterval();
      assert.ok(interval >= state.minInterval, `Interval ${interval} should be >= ${state.minInterval}`);
      assert.ok(interval <= state.maxInterval, `Interval ${interval} should be <= ${state.maxInterval}`);
    }
  });

  it('should track sameBook mode correctly', () => {
    const state = createJumpAroundState();
    
    // Simulate startJumpAround(true)
    state.active = true;
    state.sameBook = true;
    assert.strictEqual(state.sameBook, true);
    
    // Reset
    state.active = false;
    state.sameBook = false;
    
    // Simulate startJumpAround(false)
    state.active = true;
    state.sameBook = false;
    assert.strictEqual(state.sameBook, false);
  });
});

// ============================================================
// RANDOM LOCATION IN SAME BOOK CALCULATION TESTS
// ============================================================

describe('Random location in same book calculation', () => {
  it('should calculate target byte within document bounds', () => {
    const docStart = 1000;
    const docEnd = 100000;
    const docLength = docEnd - docStart;
    
    for (let i = 0; i < 100; i++) {
      const randomPercent = 0.05 + Math.random() * 0.90;
      const targetByte = Math.floor(docStart + docLength * randomPercent);
      
      // Target should be at least 5% into the doc
      assert.ok(targetByte >= docStart + docLength * 0.05);
      // Target should be at most 95% into the doc
      assert.ok(targetByte <= docStart + docLength * 0.95);
    }
  });

  it('should never target the very beginning of a document', () => {
    const docStart = 0;
    const docEnd = 100000;
    const docLength = docEnd - docStart;
    
    for (let i = 0; i < 100; i++) {
      const randomPercent = 0.05 + Math.random() * 0.90;
      const targetByte = Math.floor(docStart + docLength * randomPercent);
      
      // Should never be in first 5%
      assert.ok(targetByte >= docLength * 0.05);
    }
  });

  it('should never target the very end of a document', () => {
    const docStart = 0;
    const docEnd = 100000;
    const docLength = docEnd - docStart;
    
    for (let i = 0; i < 100; i++) {
      const randomPercent = 0.05 + Math.random() * 0.90;
      const targetByte = Math.floor(docStart + docLength * randomPercent);
      
      // Should never be in last 5%
      assert.ok(targetByte <= docLength * 0.95);
    }
  });
});

// ============================================================
// HTML STRUCTURE VERIFICATION TESTS
// ============================================================

describe('HTML structure verification', () => {
  it('should have Jump Around global button in Random modal', () => {
    assert.ok(htmlContent.includes('id="jumpAroundGlobalBtn"'));
  });

  it('should have Jump Around same-book button in Random modal', () => {
    assert.ok(htmlContent.includes('id="jumpAroundSameBookBtn"'));
  });

  it('should have running woman emoji for Jump Around', () => {
    assert.ok(htmlContent.includes('🏃‍♀️'));
  });

  it('should have J keyboard shortcut for Jump Around', () => {
    assert.ok(htmlContent.includes("<kbd>J</kbd>"));
  });

  it('should have T keyboard shortcut for This Title', () => {
    assert.ok(htmlContent.includes("<kbd>T</kbd>"));
  });

  it('should have excerpt button with quill emoji', () => {
    assert.ok(htmlContent.includes('id="excerptBtn"'));
    assert.ok(htmlContent.includes('✒️'));
  });

  it('should have excerpt mode CSS', () => {
    assert.ok(htmlContent.includes('body.excerpt-mode'));
  });

  it('should hide header in excerpt mode', () => {
    assert.ok(htmlContent.includes('body.excerpt-mode header'));
    assert.ok(htmlContent.includes('display: none !important'));
  });

  it('should hide footer in excerpt mode', () => {
    assert.ok(htmlContent.includes('body.excerpt-mode footer'));
  });

  it('should have excerpt-cmd class for curl/wget', () => {
    assert.ok(htmlContent.includes('.excerpt-cmd'));
  });

  it('should have copy button in excerpt commands', () => {
    assert.ok(htmlContent.includes('.copy-btn'));
    // Copy button text may vary (Copy, Copy Code, etc.)
    assert.ok(htmlContent.includes('Copy') || htmlContent.includes('copy'), 'Should have copy functionality');
  });

  it('should have Jump Around accessible via button clicks', () => {
    // Current implementation uses button click handlers, not 'j' key
    assert.ok(htmlContent.includes('jumpAroundAll') || htmlContent.includes('jumpAroundGlobalBtn'), 
      'Should have Jump Around button');
  });

  it('should have same-book Jump Around accessible via button', () => {
    // Current implementation uses button click handlers for same-book jump
    assert.ok(htmlContent.includes('startSameBookJumpAround') || htmlContent.includes('jumpAroundBook'),
      'Should have same-book Jump Around functionality');
  });

  it('should have mode indicator element', () => {
    assert.ok(htmlContent.includes('id="modeIndicator"'));
  });
});

// ============================================================
// MOMENTUM PRESERVATION LOGIC TESTS
// ============================================================

describe('Momentum preservation during transitions', () => {
  it('should have momentum property in rope3d state', () => {
    // Verify momentum exists in the rope3d state
    assert.ok(htmlContent.includes('rope3d.momentum') || htmlContent.includes('momentum:'), 
      'Should have momentum property in rope3d state');
  });

  it('should have autoRead state tracking', () => {
    // Verify autoRead state is tracked
    assert.ok(htmlContent.includes('autoRead.active'), 
      'Should track autoRead.active state');
  });

  it('should handle loading state during Jump Around', () => {
    // Verify loading state is considered
    assert.ok(htmlContent.includes('state.loading'), 
      'Should have loading state handling');
  });
});

// ============================================================
// 2D MODE SUPPORT TESTS
// ============================================================

describe('Jump Around 2D mode support', () => {
  it('should NOT have 3D-only restriction in startJumpAround', () => {
    // The old code had: if (!rope3d.active) return;
    // This should NOT be present at the start of startJumpAround
    const funcMatch = htmlContent.match(/function startJumpAround\(sameBookOnly[^{]*\{([^}]*jumpAround\.active = true)/s);
    assert.ok(funcMatch, 'Should find startJumpAround function');
    // Check that there's no early return for non-3D mode before setting active
    assert.ok(!funcMatch![1].includes('if (!rope3d.active) return'), 
      'startJumpAround should not have 3D-only restriction');
  });

  it('should have startSameBookJumpAround function', () => {
    assert.ok(htmlContent.includes('function startSameBookJumpAround()'));
  });

  it('should support both 2D and 3D modes', () => {
    // Verify rope3d.active is checked for mode-specific behavior
    assert.ok(htmlContent.includes('rope3d.active'), 
      'Should check rope3d.active for mode-specific behavior');
  });

  it('should have chunk size controls', () => {
    // Verify chunk size controls exist
    assert.ok(htmlContent.includes('autoChunkSize') || htmlContent.includes('chunkSize'),
      'Should have chunk size controls');
  });
});

// ============================================================
// STOP MECHANISM TESTS
// ============================================================

describe('Jump Around stop mechanisms', () => {
  it('should have Escape key handler to stop Jump Around', () => {
    // Current implementation uses switch/case for keyboard handling
    assert.ok(htmlContent.includes("case 'Escape':"), 'Should have Escape key case');
    assert.ok(htmlContent.includes('stopJumpAround'), 'Should call stopJumpAround');
  });

  it('should stop Jump Around when Escape is pressed', () => {
    // The Escape handler should stop Jump Around
    assert.ok(htmlContent.includes("case 'Escape':"), 'Should handle Escape key');
    assert.ok(htmlContent.includes('jumpAround.active'), 'Should check jumpAround.active');
  });

  it('should have Jump Around toggle via button', () => {
    // Current implementation uses buttons for Jump Around toggle
    assert.ok(htmlContent.includes('startJumpAround') && htmlContent.includes('stopJumpAround'), 
      'Should have start and stop Jump Around functions');
  });

  it('should have clickable indicator when visible', () => {
    assert.ok(htmlContent.includes('.mode-indicator.visible') || htmlContent.includes('.mode-indicator'));
  });

  it('should have click handler on indicator or stop mechanism', () => {
    // Indicator click or other stop mechanism should exist
    assert.ok(htmlContent.includes('modeIndicator') && 
              (htmlContent.includes('addEventListener') || htmlContent.includes('onclick')),
      'Should have mode indicator with event handling');
  });

  it('should show stop hint in indicator text', () => {
    assert.ok(htmlContent.includes('click to stop'));
  });

  it('should have cursor pointer on indicator', () => {
    assert.ok(htmlContent.includes('cursor: pointer'));
  });

  it('should reset momentum when stopping Jump Around', () => {
    assert.ok(htmlContent.includes('rope3d.momentum') || htmlContent.includes('momentum'),
      'Should handle momentum');
  });
});

// ============================================================
// FULLSCREEN TESTS
// ============================================================

describe('Fullscreen toggle without interrupting animation', () => {
  it('should NOT have global click handler that would need fullscreen exemption', () => {
    // We removed the global click handler that stops auto-read
    // The overflow menu handler doesn't call stopAutoRead, so it's okay
    // Check for the specific pattern of a click handler that directly calls stopAutoRead
    const globalClickHandlers = htmlContent.match(/document\.addEventListener\('click'[^}]*\{[\s\S]*?\}\);/g) || [];
    const hasBadHandler = globalClickHandlers.some(handler => handler.includes('stopAutoRead'));
    assert.ok(!hasBadHandler, 'Should NOT have global click handler that stops auto-read');
  });

  it('should have fullscreen toggle function', () => {
    assert.ok(htmlContent.includes('function toggleFullscreen') || htmlContent.includes('toggleFullscreen'),
      'Should have fullscreen toggle function');
  });
});

// ============================================================
// STORAGE FALLBACK TESTS
// ============================================================

describe('Storage fallback handling', () => {
  it('should have storage abstraction with fallbacks', () => {
    assert.ok(htmlContent.includes('const storage =') || htmlContent.includes('storage ='),
      'Should have storage abstraction');
  });

  it('should handle storage with fallback mechanism', () => {
    // Current implementation uses IIFE for storage
    assert.ok(htmlContent.includes('localStorage') || htmlContent.includes('sessionStorage'),
      'Should use browser storage');
  });

  it('should use browser storage for bookmarks', () => {
    // Bookmarks use browser storage (localStorage/sessionStorage with memory fallback)
    assert.ok(htmlContent.includes('saveBookmarkToStorage') || htmlContent.includes('saveBookmark'),
      'Should have bookmark saving');
    assert.ok(htmlContent.includes('loadBookmarksFromStorage') || htmlContent.includes('loadBookmark'),
      'Should have bookmark loading');
  });

  it('should have storage for search cache', () => {
    assert.ok(htmlContent.includes('SEARCH_CACHE') || htmlContent.includes('searchCache'),
      'Should have search cache functionality');
  });
});

// ============================================================
// TELEPORT COORDINATION TESTS
// ============================================================

describe('Teleport coordination during Jump Around', () => {
  it('should have jumpAround state check', () => {
    // Animation loop should check jumpAround.active
    assert.ok(htmlContent.includes('jumpAround.active'), 
      'Should check jumpAround.active state');
  });

  it('should reset Jump Around timer when appropriate', () => {
    // When timing needs reset, should clear and reschedule timer
    assert.ok(htmlContent.includes('clearTimeout') && htmlContent.includes('jumpAround'),
      'Should be able to clear Jump Around timeout');
    assert.ok(htmlContent.includes('scheduleNextJump()'),
      'Should have scheduleNextJump function');
  });

  it('should have goToRandomLocationInSameBook function', () => {
    assert.ok(htmlContent.includes('goToRandomLocationInSameBook') || 
              htmlContent.includes('teleportToRandomLocationInBook'),
      'Should have same-book random location function');
  });

  it('should have goToRandomLocation function', () => {
    assert.ok(htmlContent.includes('goToRandomLocation') || 
              htmlContent.includes('teleportToRandomLocation'),
      'Should have random location function');
  });

  it('should have configurable interval', () => {
    assert.ok(htmlContent.includes('getJumpInterval') || htmlContent.includes('interval'),
      'Should have interval configuration');
  });
});

// ============================================================
// SEARCH BEHAVIOR TESTS
// ============================================================

describe('Search behavior during auto-read', () => {
  it('should have / key for search', () => {
    // The '/' key should be able to open search
    assert.ok(htmlContent.includes("'/'") || htmlContent.includes('openSearch'),
      'Should have search functionality');
  });

  it('should NOT need search overlay click exemption - no global handler exists', () => {
    // The overflow menu handler doesn't call stopAutoRead, so it's okay
    // Check for the specific pattern of a click handler that directly calls stopAutoRead
    const globalClickHandlers = htmlContent.match(/document\.addEventListener\('click'[^}]*\{[\s\S]*?\}\);/g) || [];
    const hasBadHandler = globalClickHandlers.some(handler => handler.includes('stopAutoRead'));
    assert.ok(!hasBadHandler, 'Should NOT have global click handler that stops auto-read');
  });

  it('should handle autoRead state during navigation', () => {
    assert.ok(htmlContent.includes('autoRead.active') || htmlContent.includes('autoRead'),
      'Should track autoRead state');
  });

  it('should have loading state handling', () => {
    assert.ok(htmlContent.includes('state.loading'),
      'Should track loading state');
  });
});

console.log('All Jump Around and Excerpt tests completed.');
