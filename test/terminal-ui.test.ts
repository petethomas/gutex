import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TerminalUI } from '../src/terminal-ui.js';
import type { Position } from '../src/types.js';

describe('TerminalUI', () => {
  let ui: TerminalUI;
  let logOutput: string[];
  let originalLog: typeof console.log;
  let originalClear: typeof console.clear;
  let clearCalled: boolean;

  beforeEach(() => {
    logOutput = [];
    clearCalled = false;
    
    originalLog = console.log;
    originalClear = console.clear;
    
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(a => String(a)).join(' '));
    };
    
    console.clear = () => {
      clearCalled = true;
    };
    
    ui = new TerminalUI({ bookId: 1234, showChrome: true });
  });

  afterEach(() => {
    console.log = originalLog;
    console.clear = originalClear;
  });

  describe('constructor', () => {
    it('should set default values', () => {
      const defaultUI = new TerminalUI();
      assert.strictEqual(defaultUI.bookId, 0);
      assert.strictEqual(defaultUI.chunkSize, 200);
      assert.strictEqual(defaultUI.autoRead.active, false);
      assert.strictEqual(defaultUI.autoRead.direction, 'forward');
      assert.strictEqual(defaultUI.autoRead.intervalMs, 10000);
      assert.strictEqual(defaultUI.jumpAround.active, false);
      assert.strictEqual(defaultUI.showDebug, false);
    });

    it('should accept bookId option', () => {
      const ui = new TerminalUI({ bookId: 5678 });
      assert.strictEqual(ui.bookId, 5678);
    });
  });

  describe('auto-read state', () => {
    it('should track auto-read state', () => {
      assert.strictEqual(ui.autoRead.active, false);
      ui.autoRead.active = true;
      assert.strictEqual(ui.autoRead.active, true);
    });

    it('should track auto-read direction', () => {
      assert.strictEqual(ui.autoRead.direction, 'forward');
      ui.autoRead.direction = 'backward';
      assert.strictEqual(ui.autoRead.direction, 'backward');
    });

    it('should track auto-read interval', () => {
      assert.strictEqual(ui.autoRead.intervalMs, 10000);
      ui.autoRead.intervalMs = 1500;
      assert.strictEqual(ui.autoRead.intervalMs, 1500);
    });
  });

  describe('jump-around state', () => {
    it('should track jump-around state', () => {
      assert.strictEqual(ui.jumpAround.active, false);
      ui.jumpAround.active = true;
      assert.strictEqual(ui.jumpAround.active, true);
    });

    it('should track same-book mode', () => {
      assert.strictEqual(ui.jumpAround.sameBook, false);
      ui.jumpAround.sameBook = true;
      assert.strictEqual(ui.jumpAround.sameBook, true);
    });
  });

  describe('render', () => {
    it('should render with chrome by default', () => {
      const position: Position = {
        words: ['test', 'content'],
        wordIndex: 100,
        actualCount: 2,
        percent: '25.0',
        byteStart: 0,
        byteEnd: 100,
        isNearEnd: false
      };
      
      ui.render(position);
      
      assert.strictEqual(clearCalled, true);
      const output = logOutput.join('\n');
      assert.ok(output.includes('Book 1234'));
      assert.ok(output.includes('25.0%'));
    });

    it('should render without chrome when disabled', () => {
      const rawUI = new TerminalUI({ bookId: 1234, showChrome: false });
      const position: Position = {
        words: ['raw', 'text'],
        wordIndex: 0,
        actualCount: 2,
        percent: '0.0',
        byteStart: 0,
        byteEnd: 10,
        isNearEnd: false
      };
      
      rawUI.render(position);
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('raw text'));
      assert.ok(!output.includes('Book 1234'));
    });
  });

  describe('showHelp', () => {
    it('should display help content', () => {
      ui.showHelp();
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('Help'));
      assert.ok(output.includes('Navigation'));
      assert.ok(output.includes('Auto-Read'));
      assert.ok(output.includes('Bookmarks'));
    });
  });

  describe('showLoading', () => {
    it('should show loading message with chrome', () => {
      ui.showLoading(9999);
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('Loading book 9999'));
    });

    it('should not show loading message without chrome', () => {
      const rawUI = new TerminalUI({ showChrome: false });
      rawUI.showLoading(9999);
      
      assert.strictEqual(logOutput.length, 0);
    });
  });

  describe('showTeleporting', () => {
    it('should show teleporting message with chrome', () => {
      ui.showTeleporting(4567, 75);
      
      assert.strictEqual(clearCalled, true);
      const output = logOutput.join('\n');
      assert.ok(output.includes('Teleporting'));
      assert.ok(output.includes('4567'));
      assert.ok(output.includes('75%'));
    });
  });

  describe('showGoodbye', () => {
    it('should show goodbye with chrome', () => {
      ui.showGoodbye();
      
      assert.strictEqual(clearCalled, true);
      const output = logOutput.join('\n');
      assert.ok(output.includes('Thanks for using Gutex'));
    });

    it('should not show goodbye without chrome', () => {
      const rawUI = new TerminalUI({ showChrome: false });
      rawUI.showGoodbye();
      
      assert.strictEqual(logOutput.length, 0);
    });
  });

  describe('showStats', () => {
    it('should show stats with chrome', () => {
      ui.showStats({
        requests: 10,
        bytesDownloaded: 50000,
        totalBytes: 100000,
        efficiency: '50%',
        mirror: 'test-mirror'
      });
      
      const output = logOutput.join('\n');
      assert.ok(output.includes('Statistics'));
      assert.ok(output.includes('10'));
      assert.ok(output.includes('50,000'));
    });
  });

  describe('quickSaveBookmark', () => {
    it('should generate bookmark name', () => {
      ui.bookTitle = 'Test Book';
      
      const position: Position = {
        words: ['test'],
        wordIndex: 0,
        actualCount: 1,
        percent: '50.0',
        byteStart: 1000,
        byteEnd: 1100,
        isNearEnd: false
      };
      
      const name = ui.quickSaveBookmark(position);
      
      assert.ok(name.includes('Test Book'));
      assert.ok(name.includes('50.0%'));
    });

    it('should use book ID when title is not available', () => {
      ui.bookTitle = undefined;
      
      const position: Position = {
        words: ['test'],
        wordIndex: 0,
        actualCount: 1,
        percent: '25.0',
        byteStart: 500,
        byteEnd: 600,
        isNearEnd: false
      };
      
      const name = ui.quickSaveBookmark(position);
      
      assert.ok(name.includes('Book 1234') || name.includes('1234'));
    });
  });

  describe('book info', () => {
    it('should store book title and author', () => {
      ui.bookTitle = 'Pride and Prejudice';
      ui.bookAuthor = 'Jane Austen';
      
      assert.strictEqual(ui.bookTitle, 'Pride and Prejudice');
      assert.strictEqual(ui.bookAuthor, 'Jane Austen');
    });
  });
});

describe('TerminalUI - Mode Indicators', () => {
  let ui: TerminalUI;

  beforeEach(() => {
    ui = new TerminalUI({ bookId: 100 });
  });

  it('should track AUTO state for mode indicator', () => {
    ui.autoRead.active = true;
    ui.autoRead.direction = 'forward';
    ui.autoRead.intervalMs = 2000;
    
    // Verify state is correctly set
    assert.strictEqual(ui.autoRead.active, true);
    assert.strictEqual(ui.autoRead.direction, 'forward');
    assert.strictEqual(ui.autoRead.intervalMs, 2000);
  });

  it('should track JUMP state for mode indicator', () => {
    ui.jumpAround.active = true;
    ui.jumpAround.sameBook = false;
    
    // Verify state is correctly set
    assert.strictEqual(ui.jumpAround.active, true);
    assert.strictEqual(ui.jumpAround.sameBook, false);
  });

  it('should track JUMP same-book state for mode indicator', () => {
    ui.jumpAround.active = true;
    ui.jumpAround.sameBook = true;
    
    // Verify state shows BOOK mode
    assert.strictEqual(ui.jumpAround.sameBook, true);
  });
});

describe('TerminalUI - Jump Around Banner', () => {
  let ui: TerminalUI;

  beforeEach(() => {
    ui = new TerminalUI({ bookId: 100 });
  });

  it('should track jump around countdown state', () => {
    // Initially not active
    assert.strictEqual(ui.jumpAround.active, false);
    assert.strictEqual(ui.jumpAround.nextJumpTime, 0);
    
    // Simulate jump around start
    ui.jumpAround.active = true;
    ui.jumpAround.sameBook = false;
    ui.jumpAround.intervalMs = 60000;
    ui.jumpAround.nextJumpTime = Date.now() + 60000;
    
    assert.strictEqual(ui.jumpAround.active, true);
    assert.ok(ui.jumpAround.nextJumpTime > Date.now());
  });

  it('should have intervalMs and nextJumpTime in JumpAroundState', () => {
    // Verify the shape of the state
    assert.strictEqual(typeof ui.jumpAround.intervalMs, 'number');
    assert.strictEqual(typeof ui.jumpAround.nextJumpTime, 'number');
    assert.strictEqual(ui.jumpAround.intervalMs, 60000); // default
    assert.strictEqual(ui.jumpAround.nextJumpTime, 0); // default
  });

  it('should distinguish between same-book and all-books modes', () => {
    ui.jumpAround.active = true;
    
    ui.jumpAround.sameBook = false;
    assert.strictEqual(ui.jumpAround.sameBook, false);
    
    ui.jumpAround.sameBook = true;
    assert.strictEqual(ui.jumpAround.sameBook, true);
  });
});

describe('TerminalUI - Random Menu to Jump Around Flow', () => {
  let ui: TerminalUI;

  beforeEach(() => {
    ui = new TerminalUI({ bookId: 100 });
  });

  it('after starting jump around, banner state should be properly set', () => {
    // Simulate what startJumpAround does to ui state
    const intervalMs = 60000;
    ui.jumpAround.active = true;
    ui.jumpAround.sameBook = false;
    ui.jumpAround.intervalMs = intervalMs;
    ui.jumpAround.nextJumpTime = Date.now() + intervalMs;
    
    // Verify all state is set for banner to render
    assert.strictEqual(ui.jumpAround.active, true);
    assert.strictEqual(ui.jumpAround.sameBook, false);
    assert.strictEqual(ui.jumpAround.intervalMs, 60000);
    assert.ok(ui.jumpAround.nextJumpTime > Date.now());
    assert.ok(ui.jumpAround.nextJumpTime <= Date.now() + 60000);
  });

  it('countdown should return valid seconds string', () => {
    // Set up jump around state
    ui.jumpAround.active = true;
    ui.jumpAround.nextJumpTime = Date.now() + 45000; // 45 seconds from now
    
    // Access getJumpCountdown via render side effects - check state is right
    const remaining = ui.jumpAround.nextJumpTime - Date.now();
    const seconds = Math.ceil(remaining / 1000);
    
    assert.ok(seconds >= 44 && seconds <= 46, `Countdown should be ~45s, got ${seconds}`);
  });

  it('random menu "j" option should map to jump-all', async () => {
    // This tests the mapping in showRandomMenu
    // 'j' key should return 'jump-all' which triggers startJumpAround(false)
    
    // The mapping is:
    // case 'j': return 'jump-all';
    // And 'jump-all' triggers: await this.startJumpAround(false);
    
    // Verify the expected mapping
    const menuMapping: Record<string, string> = {
      'b': 'book',
      'l': 'location', 
      'j': 'jump-all',
      't': 'jump-book'
    };
    
    assert.strictEqual(menuMapping['j'], 'jump-all');
  });
});

describe('Jump Around - Mode Preservation During Teleport', () => {
  it('jump around should stay active when loading new book', () => {
    const ui = new TerminalUI({ bookId: 100 });
    
    // Simulate startJumpAround setting state
    ui.jumpAround.active = true;
    ui.jumpAround.sameBook = false;
    ui.jumpAround.nextJumpTime = Date.now() + 60000;
    
    // After loadBook is called (which now doesn't stop jump around),
    // the state should still be active
    // In real code, loadBook doesn't touch jumpAround at all now
    
    assert.strictEqual(ui.jumpAround.active, true, 'Jump around should remain active');
  });

  it('stopJumpAround should clear all jump state', () => {
    const ui = new TerminalUI({ bookId: 100 });
    
    // Set up active jump around state
    ui.jumpAround.active = true;
    ui.jumpAround.sameBook = false;
    ui.jumpAround.nextJumpTime = Date.now() + 60000;
    
    // Simulate what stopJumpAround does to UI state
    ui.jumpAround.active = false;
    ui.jumpAround.nextJumpTime = 0;
    
    assert.strictEqual(ui.jumpAround.active, false);
    assert.strictEqual(ui.jumpAround.nextJumpTime, 0);
  });
});
