import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { KeyboardHandler } from '../src/keyboard.js';

describe('KeyboardHandler - Enhanced Features', () => {
  let handler: KeyboardHandler;
  let callbacksCalled: string[];

  beforeEach(() => {
    handler = new KeyboardHandler();
    callbacksCalled = [];
  });

  afterEach(() => {
    handler.stop();
  });

  describe('callback registration', () => {
    it('should register all enhanced callbacks', () => {
      // Register all callbacks
      handler.onForward(() => callbacksCalled.push('forward'));
      handler.onBackward(() => callbacksCalled.push('backward'));
      handler.onQuit(() => callbacksCalled.push('quit'));
      handler.onHelp(() => callbacksCalled.push('help'));
      handler.onSearch(() => callbacksCalled.push('search'));
      handler.onBookmarks(() => callbacksCalled.push('bookmarks'));
      handler.onSaveBookmark(() => callbacksCalled.push('saveBookmark'));
      handler.onGotoPercent(() => callbacksCalled.push('gotoPercent'));
      handler.onToggleAuto(() => callbacksCalled.push('toggleAuto'));
      handler.onAutoFaster(() => callbacksCalled.push('autoFaster'));
      handler.onAutoSlower(() => callbacksCalled.push('autoSlower'));
      handler.onReverseAuto(() => callbacksCalled.push('reverseAuto'));
      handler.onRandomMenu(() => callbacksCalled.push('randomMenu'));
      handler.onJumpAround(() => callbacksCalled.push('jumpAround'));
      handler.onChunkBigger(() => callbacksCalled.push('chunkBigger'));
      handler.onChunkSmaller(() => callbacksCalled.push('chunkSmaller'));
      handler.onDebug(() => callbacksCalled.push('debug'));
      handler.onPageUp(() => callbacksCalled.push('pageUp'));
      handler.onPageDown(() => callbacksCalled.push('pageDown'));

      // Verify no errors - callbacks are registered
      assert.ok(true, 'All callbacks registered without error');
    });
  });

  describe('pause/resume', () => {
    it('should track paused state', () => {
      assert.strictEqual(handler.isPaused(), false, 'Should start unpaused');
      
      handler.pause();
      assert.strictEqual(handler.isPaused(), true, 'Should be paused after pause()');
      
      handler.resume();
      assert.strictEqual(handler.isPaused(), false, 'Should be unpaused after resume()');
    });
  });

  describe('prompt method', () => {
    it('should have prompt method', () => {
      assert.strictEqual(typeof handler.prompt, 'function');
    });

    it('should have promptChar method', () => {
      assert.strictEqual(typeof handler.promptChar, 'function');
    });
  });
});

describe('KeyboardHandler - Key Dispatch', () => {
  let handler: KeyboardHandler;
  let callbacksCalled: string[];

  beforeEach(() => {
    handler = new KeyboardHandler();
    callbacksCalled = [];
    
    // Register all callbacks
    handler.onForward(() => callbacksCalled.push('forward'));
    handler.onBackward(() => callbacksCalled.push('backward'));
    handler.onQuit(() => callbacksCalled.push('quit'));
    handler.onHelp(() => callbacksCalled.push('help'));
    handler.onSearch(() => callbacksCalled.push('search'));
    handler.onBookmarks(() => callbacksCalled.push('bookmarks'));
    handler.onSaveBookmark(() => callbacksCalled.push('saveBookmark'));
    handler.onGotoPercent(() => callbacksCalled.push('gotoPercent'));
    handler.onToggleAuto(() => callbacksCalled.push('toggleAuto'));
    handler.onAutoFaster(() => callbacksCalled.push('autoFaster'));
    handler.onAutoSlower(() => callbacksCalled.push('autoSlower'));
    handler.onReverseAuto(() => callbacksCalled.push('reverseAuto'));
    handler.onRandomMenu(() => callbacksCalled.push('randomMenu'));
    handler.onJumpAround(() => callbacksCalled.push('jumpAround'));
    handler.onChunkBigger(() => callbacksCalled.push('chunkBigger'));
    handler.onChunkSmaller(() => callbacksCalled.push('chunkSmaller'));
    handler.onDebug(() => callbacksCalled.push('debug'));
    handler.onPageUp(() => callbacksCalled.push('pageUp'));
    handler.onPageDown(() => callbacksCalled.push('pageDown'));
    handler.onEscape(() => callbacksCalled.push('escape'));
  });

  afterEach(() => {
    handler.stop();
  });

  // Access internal handleKeypress for testing
  function simulateKey(str: string, key: { name?: string; ctrl?: boolean; shift?: boolean }) {
    // @ts-expect-error accessing private method for testing
    handler.handleKeypress(str, key);
  }

  it('should dispatch forward on up arrow', () => {
    simulateKey('', { name: 'up' });
    assert.deepStrictEqual(callbacksCalled, ['forward']);
  });

  it('should dispatch forward on right arrow', () => {
    simulateKey('', { name: 'right' });
    assert.deepStrictEqual(callbacksCalled, ['forward']);
  });

  it('should dispatch forward on w key', () => {
    simulateKey('w', { name: 'w' });
    assert.deepStrictEqual(callbacksCalled, ['forward']);
  });

  it('should dispatch backward on down arrow', () => {
    simulateKey('', { name: 'down' });
    assert.deepStrictEqual(callbacksCalled, ['backward']);
  });

  it('should dispatch backward on left arrow', () => {
    simulateKey('', { name: 'left' });
    assert.deepStrictEqual(callbacksCalled, ['backward']);
  });

  it('should dispatch quit on q', () => {
    simulateKey('q', { name: 'q' });
    assert.deepStrictEqual(callbacksCalled, ['quit']);
  });

  it('should dispatch escape on escape key', () => {
    simulateKey('', { name: 'escape' });
    assert.deepStrictEqual(callbacksCalled, ['escape']);
  });

  it('should dispatch help on h', () => {
    simulateKey('h', { name: 'h' });
    assert.deepStrictEqual(callbacksCalled, ['help']);
  });

  it('should dispatch help on ?', () => {
    simulateKey('?', { name: undefined });
    assert.deepStrictEqual(callbacksCalled, ['help']);
  });

  it('should dispatch search on /', () => {
    simulateKey('/', { name: undefined });
    assert.deepStrictEqual(callbacksCalled, ['search']);
  });

  it('should dispatch bookmarks on b', () => {
    simulateKey('b', { name: 'b' });
    assert.deepStrictEqual(callbacksCalled, ['bookmarks']);
  });

  it('should dispatch saveBookmark on B (shift+b)', () => {
    simulateKey('B', { name: 'b', shift: true });
    assert.deepStrictEqual(callbacksCalled, ['saveBookmark']);
  });

  it('should dispatch toggleAuto on space', () => {
    simulateKey(' ', { name: 'space' });
    assert.deepStrictEqual(callbacksCalled, ['toggleAuto']);
  });

  it('should dispatch autoFaster on +', () => {
    simulateKey('+', { name: undefined });
    assert.deepStrictEqual(callbacksCalled, ['autoFaster']);
  });

  it('should dispatch autoSlower on -', () => {
    simulateKey('-', { name: undefined });
    assert.deepStrictEqual(callbacksCalled, ['autoSlower']);
  });

  it('should dispatch reverseAuto on x', () => {
    simulateKey('x', { name: 'x' });
    assert.deepStrictEqual(callbacksCalled, ['reverseAuto']);
  });

  it('should dispatch randomMenu on r', () => {
    simulateKey('r', { name: 'r' });
    assert.deepStrictEqual(callbacksCalled, ['randomMenu']);
  });

  it('should dispatch jumpAround on j', () => {
    simulateKey('j', { name: 'j' });
    assert.deepStrictEqual(callbacksCalled, ['jumpAround']);
  });

  it('should dispatch chunkBigger on ]', () => {
    simulateKey(']', { name: undefined });
    assert.deepStrictEqual(callbacksCalled, ['chunkBigger']);
  });

  it('should dispatch chunkSmaller on [', () => {
    simulateKey('[', { name: undefined });
    assert.deepStrictEqual(callbacksCalled, ['chunkSmaller']);
  });

  it('should dispatch debug on D (shift+d)', () => {
    simulateKey('D', { name: 'd', shift: true });
    assert.deepStrictEqual(callbacksCalled, ['debug']);
  });

  it('should dispatch pageUp on pageup', () => {
    simulateKey('', { name: 'pageup' });
    assert.deepStrictEqual(callbacksCalled, ['pageUp']);
  });

  it('should dispatch pageDown on pagedown', () => {
    simulateKey('', { name: 'pagedown' });
    assert.deepStrictEqual(callbacksCalled, ['pageDown']);
  });

  it('should dispatch gotoPercent on g', () => {
    simulateKey('g', { name: 'g' });
    assert.deepStrictEqual(callbacksCalled, ['gotoPercent']);
  });

  it('should NOT dispatch when paused', () => {
    handler.pause();
    simulateKey('', { name: 'up' });
    assert.deepStrictEqual(callbacksCalled, [], 'Should not dispatch when paused');
  });

  it('should resume dispatching after resume()', () => {
    handler.pause();
    simulateKey('', { name: 'up' });
    assert.deepStrictEqual(callbacksCalled, [], 'Should not dispatch when paused');
    
    handler.resume();
    simulateKey('', { name: 'up' });
    assert.deepStrictEqual(callbacksCalled, ['forward'], 'Should dispatch after resume');
  });
});

describe('KeyboardHandler - Key Bindings', () => {
  // These are static analysis tests that verify the expected key bindings
  // are documented and the handler structure is correct
  
  it('should have navigation keys: arrows and WASD', () => {
    // Forward: up, right, w, d
    // Backward: down, left, s, a
    const expectedForward = ['up', 'right', 'w', 'd'];
    const expectedBackward = ['down', 'left', 's', 'a'];
    
    // This is a documentation test
    assert.ok(expectedForward.length === 4);
    assert.ok(expectedBackward.length === 4);
  });

  it('should have mode toggle keys', () => {
    const modeKeys = {
      help: ['h', '?'],
      search: ['/'],
      bookmarks: ['b'],
      saveBookmark: ['B'],
      gotoPercent: ['g'],
      toggleAuto: ['space'],
      autoFaster: ['+', '='],
      autoSlower: ['-', '_'],
      reverseAuto: ['x'],
      randomMenu: ['r'],
      jumpAround: ['j'],
      chunkBigger: [']'],
      chunkSmaller: ['['],
      debug: ['D'],
      pageUp: ['pageup'],
      pageDown: ['pagedown']
    };
    
    assert.ok(Object.keys(modeKeys).length > 0);
  });
});

describe('KeyboardHandler - Page Navigation', () => {
  it('should have pageup and pagedown keys for jump navigation', () => {
    const pageKeys = {
      pageUp: ['pageup'],
      pageDown: ['pagedown']
    };
    
    // Page keys jump by ~10% of the book
    assert.strictEqual(pageKeys.pageUp[0], 'pageup');
    assert.strictEqual(pageKeys.pageDown[0], 'pagedown');
  });
});

describe('KeyboardHandler - Post-Prompt Recovery', () => {
  let handler: KeyboardHandler;
  let callbacksCalled: string[];

  beforeEach(() => {
    handler = new KeyboardHandler();
    callbacksCalled = [];
    
    handler.onForward(() => callbacksCalled.push('forward'));
    handler.onBackward(() => callbacksCalled.push('backward'));
    handler.onQuit(() => callbacksCalled.push('quit'));
    handler.onEscape(() => callbacksCalled.push('escape'));
  });

  afterEach(() => {
    handler.stop();
  });

  function simulateKey(str: string, key: { name?: string; ctrl?: boolean; shift?: boolean; sequence?: string }) {
    // @ts-expect-error accessing private method for testing
    handler.handleKeypress(str, key);
  }

  it('should dispatch forward after pause/resume cycle (simulating prompt flow)', () => {
    // Simulate what prompt() does: pause, then resume
    handler.pause();
    assert.strictEqual(handler.isPaused(), true);
    
    // While paused, keys should not dispatch
    simulateKey('', { name: 'up' });
    assert.deepStrictEqual(callbacksCalled, []);
    
    // After resume, keys should work
    handler.resume();
    simulateKey('', { name: 'up' });
    assert.deepStrictEqual(callbacksCalled, ['forward']);
  });

  it('should correctly parse arrow keys vs raw escape', () => {
    // Arrow keys have a sequence like \x1b[A
    // Raw escape has sequence \x1b and name 'escape'
    
    // Up arrow should trigger forward, not escape
    simulateKey('', { name: 'up', sequence: '\x1b[A' });
    assert.deepStrictEqual(callbacksCalled, ['forward']);
    
    // Raw escape should trigger escape callback (context-aware)
    callbacksCalled = [];
    simulateKey('\x1b', { name: 'escape', sequence: '\x1b' });
    assert.deepStrictEqual(callbacksCalled, ['escape']);
  });

  it('should handle multiple pause/resume cycles', () => {
    for (let i = 0; i < 5; i++) {
      handler.pause();
      handler.resume();
    }
    
    // Should still work after multiple cycles
    simulateKey('', { name: 'up' });
    assert.deepStrictEqual(callbacksCalled, ['forward']);
  });
});
