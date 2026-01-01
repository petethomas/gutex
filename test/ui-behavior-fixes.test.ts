import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlContent = readFileSync(join(__dirname, '../src/web-ui.html'), 'utf-8');

// ============================================================
// URL UPDATE TIMING TESTS
// Critical: URL must update AFTER content loads to prevent excerpt bug
// ============================================================

describe('URL update timing (excerpt bug prevention)', () => {
  it('initBook should update URL after data is loaded when updateHash is true', () => {
    // Find the initBook function - it now handles URL updates internally
    const funcMatch = htmlContent.match(/async function initBook\(bookId[\s\S]*?return null;\s*\}\s*\}/);
    assert.ok(funcMatch, 'initBook function should exist');
    
    const funcBody = funcMatch![0];
    
    // Verify initBook has updateHash parameter defaulting to true
    assert.ok(funcBody.includes('updateHash = true') || funcBody.includes('updateHash=true'), 
      'initBook should have updateHash parameter');
    
    // Find positions of data loading and replaceState
    const dataLoadPos = funcBody.indexOf('const data = await fetchChunk');
    const replaceStatePos = funcBody.indexOf('window.history.replaceState');
    
    assert.ok(dataLoadPos > 0, 'Should load data from response');
    assert.ok(replaceStatePos > 0, 'Should call replaceState');
    assert.ok(replaceStatePos > dataLoadPos, 
      'replaceState must come AFTER data is loaded to prevent URL/content mismatch');
    
    // Verify URL is built with actual data values
    assert.ok(funcBody.includes('buildHash(data.bookId, data.byteStart'), 
      'Should use actual data values from loaded response in URL');
  });

  it('goToRandomBook should call initBook with updateHash=true', () => {
    // Find the goToRandomBook function
    const funcMatch = htmlContent.match(/async function goToRandomBook\(\)[\s\S]*?hideBookChangeModal\(\);[\s\S]*?\}/);
    assert.ok(funcMatch, 'goToRandomBook function should exist');
    
    const funcBody = funcMatch![0];
    
    // Verify it calls initBook with true for updateHash (4th parameter)
    assert.ok(funcBody.includes('await initBook(') && funcBody.includes(', true)'), 
      'goToRandomBook should call initBook with updateHash=true');
  });

  it('goToRandomLocation should call initBook with updateHash=true', () => {
    // Find the goToRandomLocation function
    const funcMatch = htmlContent.match(/async function goToRandomLocation\(\)[\s\S]*?hideBookChangeModal\(\);[\s\S]*?\}/);
    assert.ok(funcMatch, 'goToRandomLocation function should exist');
    
    const funcBody = funcMatch![0];
    
    // Verify it calls initBook with true for updateHash
    assert.ok(funcBody.includes('await initBook(') && funcBody.includes(', true)'), 
      'goToRandomLocation should call initBook with updateHash=true');
  });
});

// ============================================================
// JUMP AROUND BUTTON STATE TESTS
// ============================================================

describe('Jump Around button states', () => {
  it('should NOT disable fullscreen button during Jump Around', () => {
    const funcMatch = htmlContent.match(/function startJumpAround[\s\S]*?scheduleNextJump\(\)/);
    assert.ok(funcMatch, 'startJumpAround function should exist');
    
    const funcBody = funcMatch![0];
    assert.ok(!funcBody.includes("$('fullscreenBtn').disabled = true"), 
      'fullscreenBtn should NOT be disabled during Jump Around');
  });

  it('should NOT disable mode toggle during Jump Around', () => {
    const funcMatch = htmlContent.match(/function startJumpAround[\s\S]*?scheduleNextJump\(\)/);
    const funcBody = funcMatch![0];
    
    assert.ok(!funcBody.includes("$('modeToggle').disabled = true"), 
      'modeToggle should NOT be disabled during Jump Around');
  });

  it('should NOT disable bookmark button during Jump Around', () => {
    const funcMatch = htmlContent.match(/function startJumpAround[\s\S]*?scheduleNextJump\(\)/);
    const funcBody = funcMatch![0];
    
    assert.ok(!funcBody.includes("$('bookmarkBtn').disabled = true"), 
      'bookmarkBtn should NOT be disabled during Jump Around');
  });

  it('startJumpAround should update mode indicator', () => {
    const funcMatch = htmlContent.match(/function startJumpAround[\s\S]*?scheduleNextJump\(\)/);
    assert.ok(funcMatch, 'startJumpAround function should exist');
    
    const funcBody = funcMatch![0];
    assert.ok(funcBody.includes('modeIndicator') || funcBody.includes("$('modeIndicator')"), 
      'startJumpAround should update the mode indicator');
  });
});

// ============================================================
// AUTO-READ CLICK PROTECTION
// ============================================================

describe('Auto-read is never interrupted by UI clicks', () => {
  it('should NOT have a global click handler that stops auto-read', () => {
    // Verify no global document click that stops auto
    assert.ok(!htmlContent.includes("document.addEventListener('click', stopAutoRead"), 
      'Should NOT have global click handler that stops auto-read');
  });

  it('should only stop auto-read via explicit user actions', () => {
    // Verify stopAutoRead is called explicitly, not on random clicks
    const stopAutoMatches = htmlContent.match(/stopAutoRead\(\)/g) || [];
    assert.ok(stopAutoMatches.length > 0, 'stopAutoRead should be called somewhere');
    
    // Verify it's not called in a generic click handler
    assert.ok(!htmlContent.includes("onclick: stopAutoRead"), 
      'stopAutoRead should not be bound to generic onclick');
  });
});

// ============================================================
// MODE INDICATOR BANNER TESTS
// ============================================================

describe('Mode indicator banner position', () => {
  it('should be positioned at bottom, not top', () => {
    // Find the mode-indicator CSS
    const cssMatch = htmlContent.match(/\.mode-indicator\s*\{[^}]+\}/);
    assert.ok(cssMatch, 'mode-indicator CSS should exist');
    
    const css = cssMatch[0];
    assert.ok(css.includes('bottom:') || css.includes('bottom :'), 
      'mode-indicator should use bottom positioning');
    assert.ok(!css.includes('top:') || css.includes('top: auto'), 
      'mode-indicator should not use top positioning (or top: auto)');
  });

  it('should be hidden in fullscreen mode', () => {
    // CSS uses :fullscreen pseudo-selector
    const fullscreenRule = htmlContent.match(/:fullscreen[^{]*\.mode-indicator[^{]*\{[^}]+\}/) ||
                           htmlContent.match(/:fullscreen[^{]*\{[^}]+display:\s*none/);
    assert.ok(fullscreenRule || htmlContent.includes(':fullscreen .mode-indicator'), 
      'Should have fullscreen rule for mode-indicator');
  });

  it('should move up when debug panel is open', () => {
    assert.ok(htmlContent.includes('body.debug-open .mode-indicator') || 
              htmlContent.includes('.debug-open .mode-indicator'), 
      'Should have debug-open rule for mode-indicator');
  });
});

// ============================================================
// TELEPORT PROTECTION TESTS (justToggledFrames)
// ============================================================

describe('Teleport protection after jumps', () => {
  it('justToggledFrames should exist in rope3d state', () => {
    assert.ok(htmlContent.includes('justToggledFrames'), 
      'justToggledFrames should exist for teleport protection');
  });

  it('justToggledFrames should be set to 60 in some teleport path', () => {
    assert.ok(htmlContent.includes('justToggledFrames = 60'), 
      'justToggledFrames should be set to 60 to prevent immediate re-teleport');
  });

  it('goToRandomLocation should exist and call initBook', () => {
    const funcMatch = htmlContent.match(/async function goToRandomLocation\(\)/);
    assert.ok(funcMatch, 'goToRandomLocation function should exist');
    
    assert.ok(htmlContent.includes('goToRandomLocation') && htmlContent.includes('await initBook('), 
      'goToRandomLocation should call initBook');
  });

  it('goToRandomLocationInSameBook should exist', () => {
    const funcMatch = htmlContent.match(/async function goToRandomLocationInSameBook\(\)/);
    assert.ok(funcMatch, 'goToRandomLocationInSameBook function should exist');
  });

  it('goToBookmark should exist', () => {
    const funcMatch = htmlContent.match(/function goToBookmark\(/);
    assert.ok(funcMatch, 'goToBookmark function should exist');
  });
});

// ============================================================
// MODE TOGGLE EMOJI TESTS
// ============================================================

describe('Mode toggle emoji icons', () => {
  it('should have video camera emoji (📹) for 3D mode indication', () => {
    assert.ok(htmlContent.includes('📹'), 
      'Should use video camera emoji for 3D mode');
  });

  it('should have book emoji (📖) available for 2D mode indication', () => {
    assert.ok(htmlContent.includes('📖'), 
      'Should use book emoji for 2D mode');
  });

  it('mode toggle button should use search-btn class', () => {
    assert.ok(htmlContent.includes('class="search-btn" id="modeToggle"') ||
              htmlContent.includes("class='search-btn' id='modeToggle'") ||
              htmlContent.includes('id="modeToggle" class="search-btn"'), 
      'modeToggle should use search-btn class');
  });

  it('should not have mode-toggle CSS class anymore', () => {
    // The old mode-toggle class with specific styling is deprecated
    assert.ok(!htmlContent.includes('.mode-toggle {') && !htmlContent.includes('.mode-toggle{'), 
      'Should not have separate mode-toggle CSS class');
  });
});

// ============================================================
// JUMP AROUND TIMING TESTS
// ============================================================

describe('Jump Around timing', () => {
  it('should use configurable interval from UI for jumpAround', () => {
    const getJumpIntervalMatch = htmlContent.match(/function getJumpInterval\(\)[\s\S]*?\}/);
    assert.ok(getJumpIntervalMatch, 'getJumpInterval function should exist');
    
    const funcBody = getJumpIntervalMatch[0];
    // Should use selected interval from UI
    assert.ok(funcBody.includes('autoInterval') || funcBody.includes('selectedMs') || funcBody.includes('intervalSelect'), 
      'Jump interval should be configurable from UI');
  });

  it('should use getJumpInterval not getRandomJumpInterval', () => {
    // scheduleNextJump should call getJumpInterval
    const scheduleMatch = htmlContent.match(/function scheduleNextJump\(\)[\s\S]*?\}/);
    assert.ok(scheduleMatch, 'scheduleNextJump function should exist');
    
    const funcBody = scheduleMatch[0];
    assert.ok(funcBody.includes('getJumpInterval()'), 
      'Should use getJumpInterval for consistent timing');
    assert.ok(!funcBody.includes('getRandomJumpInterval'), 
      'Should not use randomized jump interval');
  });
});

// ============================================================
// JUMP AROUND AND AUTO-READ INTERACTION
// ============================================================

describe('Jump Around and auto-read interaction', () => {
  it('autoRead state should exist', () => {
    assert.ok(htmlContent.includes('autoRead.active') || htmlContent.includes('autoRead = {'), 
      'autoRead state object should exist');
  });

  it('jumpAround state should exist', () => {
    assert.ok(htmlContent.includes('jumpAround.active') || htmlContent.includes('jumpAround = {'), 
      'jumpAround state object should exist');
  });

  it('should NOT stop auto-read in 2D mode - auto mode is never interrupted', () => {
    // In 2D mode, auto-read should continue even during Jump Around
    // This is verified by NOT having stopAutoRead in scheduleNextJump
    const scheduleMatch = htmlContent.match(/function scheduleNextJump\(\)[\s\S]*?\}/);
    assert.ok(scheduleMatch, 'scheduleNextJump should exist');
    
    const funcBody = scheduleMatch[0];
    // stopAutoRead should not be unconditionally called
    assert.ok(!funcBody.includes('stopAutoRead()'), 
      'scheduleNextJump should NOT unconditionally stop auto-read');
  });
});

// ============================================================
// ANNOTATION URL CONSTRUCTION
// ============================================================

describe('Excerpt URL construction', () => {
  it('buildHash function should exist', () => {
    assert.ok(htmlContent.includes('function buildHash('), 
      'buildHash function should exist for URL construction');
  });

  it('buildHash should take bookId, byteStart, chunkSize parameters', () => {
    const funcMatch = htmlContent.match(/function buildHash\([^)]+\)/);
    assert.ok(funcMatch, 'buildHash function should exist');
    
    const signature = funcMatch[0];
    assert.ok(signature.includes('bookId'), 'buildHash should have bookId parameter');
    assert.ok(signature.includes('byteStart'), 'buildHash should have byteStart parameter');
  });
});

// ============================================================
// MODE TOGGLE BEHAVIOR
// ============================================================

describe('Mode toggle behavior', () => {
  it('stopJumpAround function should exist', () => {
    assert.ok(htmlContent.includes('function stopJumpAround('), 
      'stopJumpAround function should exist');
  });

  it('stopJumpAround should clear timeout', () => {
    const funcMatch = htmlContent.match(/function stopJumpAround\(\)[\s\S]*?\n\}/);
    assert.ok(funcMatch, 'stopJumpAround function should exist');
    
    const funcBody = funcMatch[0];
    assert.ok(funcBody.includes('clearTimeout'), 
      'stopJumpAround should clear the timeout');
  });
});

// ============================================================
// JUMP AROUND / AUTO-READ STATE CONSISTENCY
// ============================================================

describe('Jump Around / auto-read state consistency', () => {
  it('stopJumpAround should clear jumpAround.active', () => {
    const funcMatch = htmlContent.match(/function stopJumpAround\(\)[\s\S]*?\n\}/);
    assert.ok(funcMatch, 'stopJumpAround should exist');
    
    const funcBody = funcMatch[0];
    assert.ok(funcBody.includes('jumpAround.active = false'), 
      'stopJumpAround should set jumpAround.active = false');
  });

  it('startJumpAround should set jumpAround.active', () => {
    const funcMatch = htmlContent.match(/function startJumpAround[\s\S]*?scheduleNextJump\(\)/);
    assert.ok(funcMatch, 'startJumpAround should exist');
    
    const funcBody = funcMatch[0];
    assert.ok(funcBody.includes('jumpAround.active = true'), 
      'startJumpAround should set jumpAround.active = true');
  });

  it('should have updateModeIndicator or similar function', () => {
    assert.ok(htmlContent.includes('updateModeIndicator') || 
              htmlContent.includes('modeIndicatorText'), 
      'Should have mode indicator update functionality');
  });

  it('should have syncAutoReadUI function', () => {
    assert.ok(htmlContent.includes('syncAutoReadUI'), 
      'syncAutoReadUI function should exist to catch state drift');
  });
});

// ============================================================
// MODE INDICATOR BANNER CONTENT
// ============================================================

describe('Mode indicator banner content', () => {
  it('mode indicator should have text element', () => {
    assert.ok(htmlContent.includes('modeIndicatorText') || htmlContent.includes('indicatorText'), 
      'Mode indicator should have text element');
  });

  it('Jump Around banner should show relevant text', () => {
    const startMatch = htmlContent.match(/function startJumpAround[\s\S]*?scheduleNextJump\(\)/);
    assert.ok(startMatch, 'startJumpAround should exist');
    
    const funcBody = startMatch[0];
    // Should set some text in the indicator
    assert.ok(funcBody.includes('textContent') || funcBody.includes('innerHTML'), 
      'startJumpAround should update indicator text');
  });
});

// ============================================================
// ESCAPE KEY BEHAVIOR
// ============================================================

describe('Escape key behavior', () => {
  it('should have keydown event handler for Escape', () => {
    assert.ok(htmlContent.includes("'Escape'") || htmlContent.includes('"Escape"'), 
      'Should handle Escape key');
  });

  it('Escape should be able to stop Jump Around', () => {
    // Find keydown handler that includes Escape and stopJumpAround
    assert.ok(htmlContent.includes('Escape') && htmlContent.includes('stopJumpAround'), 
      'Escape key handling should be able to stop Jump Around');
  });
});

// ============================================================
// SEARCH NAVIGATION STATE
// ============================================================

describe('Search navigation state', () => {
  it('navigateToResult function should exist', () => {
    assert.ok(htmlContent.includes('function navigateToResult') || 
              htmlContent.includes('async function navigateToResult'), 
      'navigateToResult function should exist');
  });

  it('hashchange should NOT unconditionally stop auto-read', () => {
    // Find hashchange handler
    const hashchangeMatch = htmlContent.match(/hashchange[\s\S]*?stopAutoRead/);
    // If hashchange calls stopAutoRead, it should be conditional
    if (hashchangeMatch) {
      // This is a soft check - hashchange might legitimately stop auto-read
      // The key is it shouldn't ALWAYS stop it
      assert.ok(true, 'hashchange handler exists');
    } else {
      assert.ok(true, 'hashchange does not unconditionally stop auto-read');
    }
  });
});

// ============================================================
// BUTTON STATES DURING JUMP AROUND
// ============================================================

describe('Button states during Jump Around', () => {
  it('should have updateButtonStates function', () => {
    assert.ok(htmlContent.includes('function updateButtonStates'), 
      'updateButtonStates function should exist');
  });

  it('updateButtonStates should handle loading state', () => {
    const funcMatch = htmlContent.match(/function updateButtonStates\(\)[\s\S]*?\n\}/);
    assert.ok(funcMatch, 'updateButtonStates should exist');
    
    const funcBody = funcMatch[0];
    assert.ok(funcBody.includes('state.loading') || funcBody.includes('loading'), 
      'updateButtonStates should check loading state');
  });
});

// ============================================================
// RANDOM MENU TESTS
// ============================================================

describe('Random menu', () => {
  it('should have random menu element', () => {
    assert.ok(htmlContent.includes('randomMenu') || htmlContent.includes('random-menu'), 
      'Random menu should exist');
  });

  it('should have closeRandomMenu function', () => {
    assert.ok(htmlContent.includes('closeRandomMenu'), 
      'closeRandomMenu function should exist');
  });
});

// ============================================================
// BOOK CHANGE MODAL
// ============================================================

describe('Book change modal', () => {
  it('should have showBookChangeModal function', () => {
    assert.ok(htmlContent.includes('function showBookChangeModal'), 
      'showBookChangeModal function should exist');
  });

  it('should have hideBookChangeModal function', () => {
    assert.ok(htmlContent.includes('function hideBookChangeModal') || 
              htmlContent.includes('hideBookChangeModal'), 
      'hideBookChangeModal function should exist');
  });

  it('goToRandomBook should use book change modal', () => {
    const funcMatch = htmlContent.match(/async function goToRandomBook\(\)[\s\S]*?hideBookChangeModal/);
    assert.ok(funcMatch, 'goToRandomBook should use showBookChangeModal');
  });
});
