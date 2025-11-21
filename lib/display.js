/**
 * Display Module
 * Handles rendering of text with or without chrome (metadata)
 */

export class Display {
  constructor(options = {}) {
    this.showChrome = options.showChrome !== false; // Default to true
    this.bookId = options.bookId;
  }
  
  /**
   * Render the current position for REPL mode
   */
  render(position) {
    console.clear();
    
    if (this.showChrome) {
      this._renderWithChrome(position);
    } else {
      this._renderWithoutChrome(position);
    }
  }
  
  /**
   * Render with full metadata (default mode)
   */
  _renderWithChrome(position) {
    const wordRange = `${position.wordIndex}-${position.wordIndex + position.actualCount - 1}`;
    console.log(`[Book ${this.bookId}] [Words ${wordRange}] [${position.percent}%]\n`);
    console.log(position.words.join(' '));
    console.log(`\n[←↓as ↑→wd to navigate | q to quit]\n`);
  }
  
  /**
   * Render without metadata (--raw mode)
   */
  _renderWithoutChrome(position) {
    console.log(position.words.join(' '));
  }
  
  /**
   * Print text for snapshot mode (no REPL, just text and exit)
   */
  static printSnapshot(position) {
    console.log(position.words.join(' '));
  }
  
  /**
   * Show loading message
   */
  showLoading(bookId) {
    if (this.showChrome) {
      console.log(`\n🔍 Loading book ${bookId}...\n`);
    }
  }
  
  /**
   * Show end of book prompt
   */
  showEndOfBook(bookId) {
    console.clear();
    console.log(`\n📖 You've reached the end of book ${bookId}!\n`);
    console.log('Choose your next move:\n');
    console.log(`  1. Move to book ${bookId + 1} (next)`);
    console.log(`  2. Move to book ${bookId - 1} (previous)`);
    console.log(`  3. Exit Gutex\n`);
  }
  
  /**
   * Show goodbye message
   */
  showGoodbye() {
    if (this.showChrome) {
      console.clear();
      console.log('\n👋 Thanks for using Gutex!\n');
    }
  }
  
  /**
   * Show statistics
   */
  showStats(stats) {
    if (this.showChrome) {
      console.log('📊 Session Statistics:');
      console.log(`   HTTP Requests: ${stats.requests}`);
      console.log(`   Bytes Downloaded: ${stats.bytesDownloaded.toLocaleString()}`);
      console.log(`   Total Book Size: ${stats.totalBytes.toLocaleString()}`);
      console.log(`   Efficiency: ${stats.efficiency} of book downloaded`);
      console.log();
    }
  }
}
