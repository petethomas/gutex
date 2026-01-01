/**
 * Keyboard Handler Module
 * Handles raw keyboard input for navigation and enhanced features
 */

import readline from 'readline';
import type { KeyboardCallbacks } from './types.js';

interface KeyData {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export class KeyboardHandler {
  private callbacks: KeyboardCallbacks = {
    forward: null,
    backward: null,
    quit: null,
    help: null,
    search: null,
    bookmarks: null,
    saveBookmark: null,
    gotoPercent: null,
    toggleAuto: null,
    autoFaster: null,
    autoSlower: null,
    reverseAuto: null,
    randomMenu: null,
    jumpAround: null,
    chunkBigger: null,
    chunkSmaller: null,
    debug: null,
    pageUp: null,
    pageDown: null,
    escape: null,
    excerpt: null
  };
  
  private paused = false;
  private keypressListener: ((str: string, key: KeyData) => void) | null = null;

  // Basic navigation callbacks
  onForward(callback: () => void): void { this.callbacks.forward = callback; }
  onBackward(callback: () => void): void { this.callbacks.backward = callback; }
  onQuit(callback: () => void): void { this.callbacks.quit = callback; }
  
  // Enhanced feature callbacks
  onHelp(callback: () => void): void { this.callbacks.help = callback; }
  onSearch(callback: () => void): void { this.callbacks.search = callback; }
  onBookmarks(callback: () => void): void { this.callbacks.bookmarks = callback; }
  onSaveBookmark(callback: () => void): void { this.callbacks.saveBookmark = callback; }
  onGotoPercent(callback: () => void): void { this.callbacks.gotoPercent = callback; }
  onToggleAuto(callback: () => void): void { this.callbacks.toggleAuto = callback; }
  onAutoFaster(callback: () => void): void { this.callbacks.autoFaster = callback; }
  onAutoSlower(callback: () => void): void { this.callbacks.autoSlower = callback; }
  onReverseAuto(callback: () => void): void { this.callbacks.reverseAuto = callback; }
  onRandomMenu(callback: () => void): void { this.callbacks.randomMenu = callback; }
  onJumpAround(callback: () => void): void { this.callbacks.jumpAround = callback; }
  onChunkBigger(callback: () => void): void { this.callbacks.chunkBigger = callback; }
  onChunkSmaller(callback: () => void): void { this.callbacks.chunkSmaller = callback; }
  onDebug(callback: () => void): void { this.callbacks.debug = callback; }
  onPageUp(callback: () => void): void { this.callbacks.pageUp = callback; }
  onPageDown(callback: () => void): void { this.callbacks.pageDown = callback; }
  onEscape(callback: () => void): void { this.callbacks.escape = callback; }
  onExcerpt(callback: () => void): void { this.callbacks.excerpt = callback; }

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  start(): void {
    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    this.keypressListener = (str: string, key: KeyData) => {
      if (!key) return;
      this.handleKeypress(str, key);
    };

    process.stdin.on('keypress', this.keypressListener);
    process.stdin.resume();
  }

  private handleKeypress(str: string, key: KeyData): void {
    // Check pause state here so tests can verify it
    if (this.paused) return;
    
    const name = key.name || '';

    // Quit commands
    if (name === 'q' || (key.ctrl && name === 'c')) {
      if (this.callbacks.quit) this.callbacks.quit();
      return;
    }

    // Escape - context-aware (may stop modes before quitting)
    if (name === 'escape') {
      if (this.callbacks.escape) this.callbacks.escape();
      return;
    }

    // Debug toggle (Shift+D) - check BEFORE plain d
    if (str === 'D' || (name === 'd' && key.shift)) {
      if (this.callbacks.debug) this.callbacks.debug();
      return;
    }

    // Forward commands: up, right, w, d
    if (name === 'up' || name === 'right' || name === 'w' || name === 'd') {
      if (this.callbacks.forward) this.callbacks.forward();
      return;
    }

    // Backward commands: down, left, s, a
    if (name === 'down' || name === 'left' || name === 's' || name === 'a') {
      if (this.callbacks.backward) this.callbacks.backward();
      return;
    }

    // Help
    if (name === 'h' || str === '?') {
      if (this.callbacks.help) this.callbacks.help();
      return;
    }

    // Search
    if (str === '/' || (key.ctrl && name === 'f')) {
      if (this.callbacks.search) this.callbacks.search();
      return;
    }

    // Quick save bookmark (Shift+B) - check BEFORE plain b
    if (str === 'B' || (name === 'b' && key.shift)) {
      if (this.callbacks.saveBookmark) this.callbacks.saveBookmark();
      return;
    }

    // Bookmarks
    if (name === 'b') {
      if (this.callbacks.bookmarks) this.callbacks.bookmarks();
      return;
    }

    // Go to percent
    if (name === 'g') {
      if (this.callbacks.gotoPercent) this.callbacks.gotoPercent();
      return;
    }

    // Auto-read toggle (space)
    if (name === 'space') {
      if (this.callbacks.toggleAuto) this.callbacks.toggleAuto();
      return;
    }

    // Auto speed controls
    if (str === '+' || str === '=') {
      if (this.callbacks.autoFaster) this.callbacks.autoFaster();
      return;
    }
    if (str === '-' || str === '_') {
      if (this.callbacks.autoSlower) this.callbacks.autoSlower();
      return;
    }

    // Reverse auto direction
    if (name === 'x') {
      if (this.callbacks.reverseAuto) this.callbacks.reverseAuto();
      return;
    }

    // Random menu
    if (name === 'r') {
      if (this.callbacks.randomMenu) this.callbacks.randomMenu();
      return;
    }

    // Jump around toggle
    if (name === 'j') {
      if (this.callbacks.jumpAround) this.callbacks.jumpAround();
      return;
    }

    // Excerpt (show curl command)
    if (name === 'c') {
      if (this.callbacks.excerpt) this.callbacks.excerpt();
      return;
    }

    // Chunk size controls
    if (str === ']') {
      if (this.callbacks.chunkBigger) this.callbacks.chunkBigger();
      return;
    }
    if (str === '[') {
      if (this.callbacks.chunkSmaller) this.callbacks.chunkSmaller();
      return;
    }

    // Page navigation for larger jumps
    if (name === 'pageup') {
      if (this.callbacks.pageUp) this.callbacks.pageUp();
      return;
    }
    if (name === 'pagedown') {
      if (this.callbacks.pageDown) this.callbacks.pageDown();
      return;
    }
  }

  stop(): void {
    if (this.keypressListener) {
      process.stdin.removeListener('keypress', this.keypressListener);
      this.keypressListener = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  async prompt(message: string, _choices?: string[]): Promise<string> {
    this.pause();
    
    // Remove our keypress listener before readline takes over
    if (this.keypressListener) {
      process.stdin.removeListener('keypress', this.keypressListener);
    }
    
    // Exit raw mode for readline
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(message, (answer: string) => {
        rl.close();
        
        // Fully reset stdin for keypress events
        // readline messes with the internal keypress state machine
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        
        // Remove any listeners readline may have left
        process.stdin.removeAllListeners('keypress');
        
        // Re-initialize keypress event emission
        readline.emitKeypressEvents(process.stdin);
        
        // Re-add our listener
        if (this.keypressListener) {
          process.stdin.on('keypress', this.keypressListener);
        }
        
        // Ensure stdin is flowing
        process.stdin.resume();
        
        this.resume();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Prompt for a single character selection
   */
  async promptChar(message: string, validChars: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      this.pause();
      process.stdout.write(message);
      
      const charListener = (str: string, key: KeyData) => {
        const char = key.name || str;
        
        // Escape cancels
        if (key.name === 'escape') {
          process.stdin.removeListener('keypress', charListener);
          this.resume();
          resolve(null);
          return;
        }
        
        // Check if valid
        if (validChars.includes(char)) {
          process.stdin.removeListener('keypress', charListener);
          this.resume();
          resolve(char);
          return;
        }
      };
      
      process.stdin.on('keypress', charListener);
    });
  }
}
