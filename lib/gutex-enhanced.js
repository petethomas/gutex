/**
 * Enhanced Gutex Class
 * Extends the original Gutex with new display options
 */

import { Fetcher } from './fetcher.js';
import { Cleaner } from './cleaner.js';
import { Navigator } from './navigator.js';
import { KeyboardHandler } from './keyboard.js';
import { Display } from './display.js';

export class GutexEnhanced {
  constructor(bookId, chunkSize, startPercent, options = {}) {
    this.bookId = bookId;
    this.chunkSize = chunkSize;
    this.startPercent = startPercent;
    this.currentPosition = null;
    this.navigator = null;
    this.keyboard = new KeyboardHandler();
    
    // Initialize display with chrome options
    this.display = new Display({
      showChrome: options.showChrome !== false,
      bookId: this.bookId
    });
  }

  async run() {
    try {
      const debug = process.env.DEBUG === '1';
      
      this.display.showLoading(this.bookId);
      
      const fetcher = new Fetcher(this.bookId, debug);
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);
      
      this.navigator = new Navigator(fetcher, boundaries, this.chunkSize);
      this.fetcher = fetcher; // Store for stats
      
      // Navigate to starting position
      this.currentPosition = await this.navigator.goToPercent(this.startPercent);
      this.display.render(this.currentPosition);
      
      // Set up keyboard handlers
      this.keyboard.onForward(() => this.handleForward());
      this.keyboard.onBackward(() => this.handleBackward());
      this.keyboard.onQuit(() => this.handleQuit());
      
      this.keyboard.start();
      
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}\n`);
      process.exit(1);
    }
  }

  async handleForward() {
    try {
      this.currentPosition = await this.navigator.moveForward(this.currentPosition);
      
      // Check if near end
      if (this.currentPosition.isNearEnd) {
        await this.handleEndOfBook();
      } else {
        this.display.render(this.currentPosition);
      }
    } catch (err) {
      console.error(`\nError: ${err.message}\n`);
    }
  }

  async handleBackward() {
    try {
      this.currentPosition = await this.navigator.moveBackward(this.currentPosition);
      this.display.render(this.currentPosition);
    } catch (err) {
      console.error(`\nError: ${err.message}\n`);
    }
  }

  async handleEndOfBook() {
    this.display.showEndOfBook(this.bookId);
    
    const choice = await this.keyboard.prompt('Enter choice (1/2/3): ', ['1', '2', '3']);
    
    if (choice === '1') {
      this.bookId++;
      this.startPercent = 0;
      this.display.bookId = this.bookId; // Update display's bookId
      await this.run();
    } else if (choice === '2') {
      this.bookId--;
      this.startPercent = 100;
      this.display.bookId = this.bookId; // Update display's bookId
      await this.run();
    } else {
      this.handleQuit();
    }
  }

  handleQuit() {
    this.display.showGoodbye();
    
    // Show efficiency stats
    if (this.fetcher) {
      const stats = this.fetcher.getStats();
      this.display.showStats(stats);
    }
    
    this.keyboard.stop();
    process.exit(0);
  }
}
