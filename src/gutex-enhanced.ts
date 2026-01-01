/**
 * Enhanced Gutex Class
 * Full-featured terminal reader with auto-read, bookmarks, search, and more
 */

import { Fetcher } from './fetcher.js';
import { Cleaner } from './cleaner.js';
import { Navigator } from './navigator.js';
import { KeyboardHandler } from './keyboard.js';
import { TerminalUI } from './terminal-ui.js';
import { CatalogManager } from './catalog-manager.js';
import type { Position, GutexEnhancedOptions } from './types.js';

export class GutexEnhanced {
  private bookId: number;
  private chunkSize: number;
  private startPercent: number;
  private currentPosition: Position | null = null;
  private navigator: Navigator | null = null;
  private fetcher: Fetcher | null = null;
  private keyboard: KeyboardHandler;
  private ui: TerminalUI;
  private catalog: CatalogManager;
  
  // Auto-read interval
  private autoIntervalId: ReturnType<typeof setInterval> | null = null;
  
  // Jump around interval
  private jumpIntervalId: ReturnType<typeof setInterval> | null = null;
  
  // Countdown refresh interval (for Jump Around display)
  private countdownIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(bookId: number, chunkSize: number, startPercent: number, options: GutexEnhancedOptions = {}) {
    this.bookId = bookId;
    this.chunkSize = chunkSize;
    this.startPercent = startPercent;
    this.keyboard = new KeyboardHandler();
    this.catalog = new CatalogManager();

    // Initialize UI
    this.ui = new TerminalUI({
      showChrome: options.showChrome !== false,
      bookId: this.bookId
    });
    this.ui.chunkSize = this.chunkSize;
  }

  async run(): Promise<void> {
    try {
      const debug = process.env.DEBUG === '1';

      this.ui.showLoading(this.bookId);
      
      // Load book info from catalog
      await this.ui.loadBookInfo(this.bookId);

      const fetcher = new Fetcher(this.bookId, debug);
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);

      this.navigator = new Navigator(fetcher, boundaries, this.chunkSize);
      this.fetcher = fetcher;

      // Navigate to starting position
      this.currentPosition = await this.navigator.goToPercent(this.startPercent);
      this.ui.render(this.currentPosition);

      // Set up keyboard handlers
      this.setupKeyboardHandlers();

      this.keyboard.start();

    } catch (err) {
      console.error(`\n❌ Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  }

  private setupKeyboardHandlers(): void {
    // Basic navigation
    this.keyboard.onForward(() => this.handleForward());
    this.keyboard.onBackward(() => this.handleBackward());
    this.keyboard.onQuit(() => this.handleQuit());
    
    // Help
    this.keyboard.onHelp(() => this.handleHelp());
    
    // Search
    this.keyboard.onSearch(() => this.handleSearch());
    
    // Bookmarks
    this.keyboard.onBookmarks(() => this.handleBookmarks());
    this.keyboard.onSaveBookmark(() => this.handleSaveBookmark());
    
    // Go to percent
    this.keyboard.onGotoPercent(() => this.handleGotoPercent());
    
    // Auto-read
    this.keyboard.onToggleAuto(() => this.handleToggleAuto());
    this.keyboard.onAutoFaster(() => this.handleAutoFaster());
    this.keyboard.onAutoSlower(() => this.handleAutoSlower());
    this.keyboard.onReverseAuto(() => this.handleReverseAuto());
    
    // Random
    this.keyboard.onRandomMenu(() => this.handleRandomMenu());
    this.keyboard.onJumpAround(() => this.handleJumpAroundToggle());
    
    // Chunk size
    this.keyboard.onChunkBigger(() => this.handleChunkBigger());
    this.keyboard.onChunkSmaller(() => this.handleChunkSmaller());
    
    // Debug
    this.keyboard.onDebug(() => this.handleDebugToggle());
    
    // Page navigation (larger jumps)
    this.keyboard.onPageUp(() => this.handlePageUp());
    this.keyboard.onPageDown(() => this.handlePageDown());
    
    // Escape - context-aware (stop modes or quit)
    this.keyboard.onEscape(() => this.handleEscape());
    
    // Excerpt mode - show curl command
    this.keyboard.onExcerpt(() => this.handleExcerpt());
  }

  // ============================================================================
  // Navigation Handlers
  // ============================================================================

  private async handleForward(): Promise<void> {
    if (!this.navigator || !this.currentPosition) return;

    try {
      this.currentPosition = await this.navigator.moveForward(this.currentPosition);

      // Check if at end of book
      if (this.currentPosition.isNearEnd && this.currentPosition.nextByteStart === undefined) {
        // In auto-motion mode, teleport automatically
        if (this.ui.autoRead.active || this.ui.jumpAround.active) {
          await this.teleportToRandomLocation();
        } else {
          // In interactive mode, ask the user
          this.ui.render(this.currentPosition);
          this.keyboard.pause();
          const shouldTeleport = await this.ui.showEndOfBookPrompt(this.keyboard, 'forward');
          this.keyboard.resume();
          if (shouldTeleport) {
            await this.teleportToRandomLocation();
          } else if (this.currentPosition) {
            this.ui.render(this.currentPosition);
          }
        }
      } else {
        this.ui.render(this.currentPosition);
      }
    } catch (err) {
      this.ui.showError((err as Error).message);
    }
  }

  private async handleBackward(): Promise<void> {
    if (!this.navigator || !this.currentPosition) return;

    try {
      const prevPosition = this.currentPosition;
      this.currentPosition = await this.navigator.moveBackward(this.currentPosition);

      // Check if at true start of book
      if (this.currentPosition.byteStart <= this.navigator.boundaries.startByte &&
          prevPosition.byteStart <= this.navigator.boundaries.startByte) {
        // In auto-motion mode, teleport automatically
        if (this.ui.autoRead.active || this.ui.jumpAround.active) {
          await this.teleportToRandomLocation();
        } else {
          // In interactive mode, ask the user
          this.ui.render(this.currentPosition);
          this.keyboard.pause();
          const shouldTeleport = await this.ui.showEndOfBookPrompt(this.keyboard, 'backward');
          this.keyboard.resume();
          if (shouldTeleport) {
            await this.teleportToRandomLocation();
          } else if (this.currentPosition) {
            this.ui.render(this.currentPosition);
          }
        }
      } else {
        this.ui.render(this.currentPosition);
      }
    } catch (err) {
      this.ui.showError((err as Error).message);
    }
  }

  private handleQuit(): void {
    // Stop any running modes
    this.stopAutoRead();
    this.stopJumpAround();
    
    this.ui.showGoodbye();

    // Show efficiency stats
    if (this.fetcher) {
      const stats = this.fetcher.getStats();
      this.ui.showStats(stats);
    }

    this.keyboard.stop();
    process.exit(0);
  }

  private handleEscape(): void {
    // Escape is context-aware:
    // 1. If jump around active, stop it
    // 2. Else if auto-read active, stop it
    // 3. Else quit
    
    if (this.ui.jumpAround.active) {
      this.stopJumpAround();
      if (this.currentPosition) {
        this.ui.render(this.currentPosition);
      }
      return;
    }
    
    if (this.ui.autoRead.active) {
      this.stopAutoRead();
      if (this.currentPosition) {
        this.ui.render(this.currentPosition);
      }
      return;
    }
    
    // No modes active, quit
    this.handleQuit();
  }

  // ============================================================================
  // Help Handler
  // ============================================================================

  private async handleHelp(): Promise<void> {
    this.keyboard.pause();
    this.ui.showHelp();
    
    // Wait for any keypress
    await new Promise<void>((resolve) => {
      const listener = () => {
        process.stdin.removeListener('keypress', listener);
        resolve();
      };
      process.stdin.once('keypress', listener);
    });
    
    this.keyboard.resume();
    if (this.currentPosition) {
      this.ui.render(this.currentPosition);
    }
  }

  // ============================================================================
  // Search Handler
  // ============================================================================

  private async handleSearch(): Promise<void> {
    this.keyboard.pause();
    this.stopAutoRead();
    this.stopJumpAround();
    
    const bookId = await this.ui.showSearch(this.keyboard);
    
    if (bookId) {
      await this.loadBook(bookId, 0);
    } else {
      this.keyboard.resume();
      if (this.currentPosition) {
        this.ui.render(this.currentPosition);
      }
    }
  }

  // ============================================================================
  // Bookmark Handlers
  // ============================================================================

  private async handleBookmarks(): Promise<void> {
    this.keyboard.pause();
    this.stopAutoRead();
    this.stopJumpAround();
    
    const result = await this.ui.showBookmarks(this.keyboard, this.currentPosition ?? undefined);
    
    if (result) {
      await this.loadBook(result.bookId, 0, result.position);
    } else {
      this.keyboard.resume();
      if (this.currentPosition) {
        this.ui.render(this.currentPosition);
      }
    }
  }

  private handleSaveBookmark(): void {
    if (!this.currentPosition) return;
    
    const name = this.ui.quickSaveBookmark(this.currentPosition);
    this.ui.showMessage(`Saved: ${name}`);
    
    // Re-render after a moment to clear the message
    setTimeout(() => {
      if (this.currentPosition) {
        this.ui.render(this.currentPosition);
      }
    }, 2000);
  }

  // ============================================================================
  // Go To Percent Handler
  // ============================================================================

  private async handleGotoPercent(): Promise<void> {
    if (!this.navigator) return;
    
    this.keyboard.pause();
    this.stopAutoRead();
    this.stopJumpAround();
    
    const percent = await this.ui.showGotoPercent(this.keyboard);
    
    this.keyboard.resume();
    
    if (percent !== null) {
      try {
        this.currentPosition = await this.navigator.goToPercent(percent);
        this.ui.render(this.currentPosition);
      } catch (err) {
        this.ui.showError((err as Error).message);
      }
    } else if (this.currentPosition) {
      this.ui.render(this.currentPosition);
    }
  }

  // ============================================================================
  // Excerpt Handler
  // ============================================================================

  private async handleExcerpt(): Promise<void> {
    if (!this.currentPosition) return;
    
    this.keyboard.pause();
    this.stopAutoRead();
    this.stopJumpAround();
    
    await this.ui.showExcerpt(this.keyboard, this.currentPosition);
    
    this.keyboard.resume();
    this.ui.render(this.currentPosition);
  }

  // ============================================================================
  // Auto-Read Handlers
  // ============================================================================

  private handleToggleAuto(): void {
    if (this.ui.autoRead.active) {
      this.stopAutoRead();
    } else {
      this.startAutoRead();
    }
    
    if (this.currentPosition) {
      this.ui.render(this.currentPosition);
    }
  }

  private startAutoRead(): void {
    this.ui.autoRead.active = true;
    
    this.autoIntervalId = setInterval(() => {
      if (this.ui.autoRead.direction === 'forward') {
        this.handleForward();
      } else {
        this.handleBackward();
      }
    }, this.ui.autoRead.intervalMs);
  }

  private stopAutoRead(): void {
    this.ui.autoRead.active = false;
    if (this.autoIntervalId) {
      clearInterval(this.autoIntervalId);
      this.autoIntervalId = null;
    }
  }

  private handleAutoFaster(): void {
    this.ui.autoRead.intervalMs = Math.max(500, this.ui.autoRead.intervalMs - 500);
    
    // Restart if active
    if (this.ui.autoRead.active) {
      this.stopAutoRead();
      this.startAutoRead();
    }
    
    if (this.currentPosition) {
      this.ui.render(this.currentPosition);
    }
  }

  private handleAutoSlower(): void {
    this.ui.autoRead.intervalMs = Math.min(10000, this.ui.autoRead.intervalMs + 500);
    
    // Restart if active
    if (this.ui.autoRead.active) {
      this.stopAutoRead();
      this.startAutoRead();
    }
    
    if (this.currentPosition) {
      this.ui.render(this.currentPosition);
    }
  }

  private handleReverseAuto(): void {
    this.ui.autoRead.direction = this.ui.autoRead.direction === 'forward' ? 'backward' : 'forward';
    
    if (this.currentPosition) {
      this.ui.render(this.currentPosition);
    }
  }

  // ============================================================================
  // Random Handlers
  // ============================================================================

  private async handleRandomMenu(): Promise<void> {
    this.keyboard.pause();
    this.stopAutoRead();
    this.stopJumpAround(); // Stop any existing jump around - will restart if they pick it
    
    const choice = await this.ui.showRandomMenu(this.keyboard);
    
    this.keyboard.resume();
    
    switch (choice) {
      case 'book':
        await this.goToRandomBook();
        break;
      case 'location':
        await this.teleportToRandomLocation();
        break;
      case 'jump-all':
        await this.startJumpAround(false);
        break;
      case 'jump-book':
        await this.startJumpAround(true);
        break;
      default:
        if (this.currentPosition) {
          this.ui.render(this.currentPosition);
        }
    }
  }

  private async handleJumpAroundToggle(): Promise<void> {
    if (this.ui.jumpAround.active) {
      this.stopJumpAround();
      if (this.currentPosition) {
        this.ui.render(this.currentPosition);
      }
    } else {
      await this.startJumpAround(false);
    }
  }

  private async startJumpAround(sameBook: boolean): Promise<void> {
    const intervalMs = 60000; // 60 seconds between jumps
    
    this.ui.jumpAround.active = true;
    this.ui.jumpAround.sameBook = sameBook;
    this.ui.jumpAround.intervalMs = intervalMs;
    this.ui.jumpAround.nextJumpTime = Date.now() + intervalMs;
    
    // Do initial jump and wait for it to complete
    await this.doJump();
    
    // Set up jump interval
    this.jumpIntervalId = setInterval(() => {
      this.ui.jumpAround.nextJumpTime = Date.now() + intervalMs;
      this.doJump();
    }, intervalMs);
    
    // Set up countdown refresh (every second)
    this.countdownIntervalId = setInterval(() => {
      if (this.currentPosition && this.ui.jumpAround.active) {
        this.ui.render(this.currentPosition);
      }
    }, 1000);
  }

  private stopJumpAround(): void {
    this.ui.jumpAround.active = false;
    this.ui.jumpAround.nextJumpTime = 0;
    
    if (this.jumpIntervalId) {
      clearInterval(this.jumpIntervalId);
      this.jumpIntervalId = null;
    }
    
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
  }

  private async doJump(): Promise<void> {
    if (this.ui.jumpAround.sameBook) {
      // Random position in same book
      if (this.navigator) {
        const percent = Math.floor(Math.random() * 100);
        try {
          this.currentPosition = await this.navigator.goToPercent(percent);
          this.ui.render(this.currentPosition);
        } catch (err) {
          this.ui.showError((err as Error).message);
        }
      }
    } else {
      // Random book and position
      await this.teleportToRandomLocation();
    }
  }

  // ============================================================================
  // Chunk Size Handlers
  // ============================================================================

  private async handleChunkBigger(): Promise<void> {
    const newSize = Math.min(500, this.chunkSize + 50);
    if (newSize !== this.chunkSize) {
      await this.updateChunkSize(newSize);
    }
  }

  private async handleChunkSmaller(): Promise<void> {
    const newSize = Math.max(50, this.chunkSize - 50);
    if (newSize !== this.chunkSize) {
      await this.updateChunkSize(newSize);
    }
  }

  private async updateChunkSize(newSize: number): Promise<void> {
    const oldSize = this.chunkSize;
    this.chunkSize = newSize;
    this.ui.chunkSize = newSize;
    
    if (this.navigator) {
      this.navigator.chunkSize = newSize;
      
      // Clear history - old chunk boundaries are no longer valid
      this.navigator.positionHistory = [];
      
      // Re-fetch current position with new chunk size
      if (this.currentPosition) {
        try {
          // Stay at same byte position - use byteStart, not percent
          const byteStart = this.currentPosition.byteStart;
          const wordIndex = this.currentPosition.wordIndex;
          
          this.currentPosition = await this.navigator._fetchChunkAt(
            byteStart,
            wordIndex,
            'forward'
          );
          this.ui.render(this.currentPosition);
          
          // Show feedback
          const direction = newSize > oldSize ? '+' : '-';
          this.ui.showMessage(`${direction} Chunk size: ${newSize} words ([ ] to adjust)`);
        } catch (err) {
          this.ui.showError((err as Error).message);
        }
      }
    }
  }

  // ============================================================================
  // Debug Handler
  // ============================================================================

  private handleDebugToggle(): void {
    this.ui.showDebug = !this.ui.showDebug;
    
    if (this.currentPosition) {
      this.ui.render(this.currentPosition);
    }
  }

  // ============================================================================
  // Page Navigation (Jump by ~10%)
  // ============================================================================

  private async handlePageDown(): Promise<void> {
    if (!this.navigator || !this.currentPosition) return;
    
    try {
      const currentPercent = parseFloat(this.currentPosition.percent);
      const newPercent = Math.min(100, currentPercent + 10);
      this.currentPosition = await this.navigator.goToPercent(newPercent);
      this.ui.render(this.currentPosition);
    } catch (err) {
      this.ui.showError((err as Error).message);
    }
  }

  private async handlePageUp(): Promise<void> {
    if (!this.navigator || !this.currentPosition) return;
    
    try {
      const currentPercent = parseFloat(this.currentPosition.percent);
      const newPercent = Math.max(0, currentPercent - 10);
      this.currentPosition = await this.navigator.goToPercent(newPercent);
      this.ui.render(this.currentPosition);
    } catch (err) {
      this.ui.showError((err as Error).message);
    }
  }

  // ============================================================================
  // Book Loading
  // ============================================================================

  private async loadBook(bookId: number, startPercent: number, byteStart?: number): Promise<void> {
    try {
      this.stopAutoRead();
      // Note: stopJumpAround is called by handlers (search, bookmarks, random menu, etc.)
      // before calling loadBook, so we don't need to call it here
      
      this.bookId = bookId;
      this.startPercent = startPercent;
      this.ui.bookId = bookId;
      this.ui.bookTitle = undefined;
      this.ui.bookAuthor = undefined;
      
      this.ui.showLoading(bookId);
      await this.ui.loadBookInfo(bookId);
      
      const debug = process.env.DEBUG === '1';
      const fetcher = new Fetcher(bookId, debug);
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);
      
      this.navigator = new Navigator(fetcher, boundaries, this.chunkSize);
      this.fetcher = fetcher;
      
      if (byteStart !== undefined) {
        // Navigate to specific byte position
        this.currentPosition = await this.navigator._fetchChunkAt(
          byteStart,
          0,
          'forward'
        );
      } else {
        this.currentPosition = await this.navigator.goToPercent(startPercent);
      }
      
      this.keyboard.resume();
      this.ui.render(this.currentPosition);
      
    } catch (err) {
      this.ui.showError((err as Error).message);
      this.keyboard.resume();
    }
  }

  private async goToRandomBook(): Promise<void> {
    try {
      // Try to get a verified random book from catalog
      let randomBookId: number;
      
      try {
        await this.catalog.ensureCatalog();
        const allBooks = this.catalog.searchCatalog(''); // Get all
        if (allBooks.length > 0) {
          const idx = Math.floor(Math.random() * allBooks.length);
          randomBookId = parseInt(allBooks[idx].id, 10);
        } else {
          randomBookId = 1 + Math.floor(Math.random() * 70000);
        }
      } catch {
        randomBookId = 1 + Math.floor(Math.random() * 70000);
      }
      
      this.ui.showTeleporting(randomBookId, 0);
      await this.loadBook(randomBookId, 0);
      
    } catch {
      // Book might not exist, try again
      await this.goToRandomBook();
    }
  }

  private async teleportToRandomLocation(): Promise<void> {
    try {
      // Pick random book (1-70000)
      const randomBookId = 1 + Math.floor(Math.random() * 70000);
      // Pick random position (0-100%)
      const randomPercent = Math.floor(Math.random() * 100);

      this.ui.showTeleporting(randomBookId, randomPercent);
      await this.loadBook(randomBookId, randomPercent);
      
    } catch {
      // Book might not exist, try again
      await this.teleportToRandomLocation();
    }
  }
}
