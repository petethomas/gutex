/**
 * Snapshot Runner
 * Handles --snapshot mode: print text at position and exit immediately
 */

import { Fetcher } from './fetcher.js';
import { Cleaner } from './cleaner.js';
import { Navigator } from './navigator.js';
import { Display } from './display.js';

export class SnapshotRunner {
  constructor(bookId, chunkSize, startPercent) {
    this.bookId = bookId;
    this.chunkSize = chunkSize;
    this.startPercent = startPercent;
  }
  
  /**
   * Run snapshot mode: load position, print text, exit
   */
  async run() {
    try {
      const debug = process.env.DEBUG === '1';
      
      // Set up fetcher and navigator
      const fetcher = new Fetcher(this.bookId, debug);
      const boundaries = await Cleaner.findCleanBoundaries(fetcher);
      const navigator = new Navigator(fetcher, boundaries, this.chunkSize);
      
      // Navigate to target position
      const position = await navigator.goToPercent(this.startPercent);
      
      // Print just the text and exit
      Display.printSnapshot(position);
      
      process.exit(0);
    } catch (err) {
      console.error(`\n❌ Error: ${err.message}\n`);
      process.exit(1);
    }
  }
}
