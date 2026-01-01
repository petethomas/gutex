/**
 * Terminal UI Module
 * Provides modal dialogs and enhanced display for terminal interface
 */

import { CatalogManager } from './catalog-manager.js';
import { listBookmarks, saveBookmark } from './bookmarks.js';
import type { Position, SearchResult, BookmarkInfo, FetcherStats } from './types.js';

// ANSI escape codes
const ANSI = {
  clearScreen: '\x1b[2J\x1b[H',
  clearLine: '\x1b[2K',
  clearToEnd: '\x1b[J',
  moveTo: (row: number, col: number) => `\x1b[${row};${col}H`,
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  inverse: '\x1b[7m',
  
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

export interface TerminalUIOptions {
  showChrome?: boolean;
  bookId?: number;
}

export interface AutoReadState {
  active: boolean;
  direction: 'forward' | 'backward';
  intervalMs: number;
}

export interface JumpAroundState {
  active: boolean;
  sameBook: boolean;
  intervalMs: number;
  nextJumpTime: number;
}

export class TerminalUI {
  private showChrome: boolean;
  public bookId: number;
  public bookTitle?: string;
  public bookAuthor?: string;
  
  private catalog: CatalogManager;
  
  // Auto-read state
  public autoRead: AutoReadState = {
    active: false,
    direction: 'forward',
    intervalMs: 10000
  };
  
  // Jump around state
  public jumpAround: JumpAroundState = {
    active: false,
    sameBook: false,
    intervalMs: 60000,
    nextJumpTime: 0
  };
  
  // Debug mode
  public showDebug = false;
  
  // Current chunk size (for display)
  public chunkSize = 200;
  
  constructor(options: TerminalUIOptions = {}) {
    this.showChrome = options.showChrome !== false;
    this.bookId = options.bookId ?? 0;
    this.catalog = new CatalogManager();
  }
  
  private write(text: string): void {
    process.stdout.write(text);
  }
  
  private getSize(): { rows: number; cols: number } {
    return {
      rows: process.stdout.rows || 24,
      cols: process.stdout.columns || 80
    };
  }
  
  private clearScreen(): void {
    if (typeof console.clear === 'function') {
      console.clear();
    }
    this.write(ANSI.clearScreen);
  }
  
  private moveTo(row: number, col: number): void {
    this.write(ANSI.moveTo(row, col));
  }
  
  private clearLine(): void {
    this.write(ANSI.clearLine);
  }
  
  // ============================================================================
  // Main View Rendering
  // ============================================================================
  
  render(position: Position): void {
    if (this.showChrome) {
      this.renderWithChrome(position);
    } else {
      this.renderWithoutChrome(position);
    }
  }
  
  private renderWithChrome(position: Position): void {
    const { rows, cols } = this.getSize();
    this.clearScreen();
    this.write(ANSI.hideCursor);
    
    // Header
    const wordRange = `${position.wordIndex}-${position.wordIndex + position.actualCount - 1}`;
    let header = `${ANSI.cyan}[Book ${this.bookId}]${ANSI.reset} `;
    header += `${ANSI.gray}Words ${wordRange}${ANSI.reset} `;
    header += `${ANSI.yellow}${position.percent}%${ANSI.reset} `;
    header += `${ANSI.cyan}[${this.chunkSize}w]${ANSI.reset}`;
    
    console.log(header);
    
    // Book info
    if (this.bookTitle || this.bookAuthor) {
      let info = '';
      if (this.bookTitle) info += `${ANSI.italic}${this.bookTitle}${ANSI.reset}`;
      if (this.bookAuthor) info += ` ${ANSI.gray}by ${this.bookAuthor}${ANSI.reset}`;
      console.log(info);
    } else {
      console.log();
    }
    
    // Book text - reduce available rows if banners are showing
    let reservedRows = 5; // header, book info, blank, status, controls
    if (this.jumpAround.active) reservedRows += 1;
    if (this.autoRead.active && !this.jumpAround.active) reservedRows += 1;
    
    const text = position.formattedText || position.words.join(' ');
    const maxTextRows = rows - reservedRows;
    const wrappedLines = this.wrapText(text, cols - 1);
    const displayLines = wrappedLines.slice(0, maxTextRows);
    console.log(displayLines.join('\n'));
    
    // Jump Around banner - prominent, with countdown
    if (this.jumpAround.active) {
      this.moveTo(rows - 3, 1);
      this.clearLine();
      
      const scope = this.jumpAround.sameBook ? 'this title' : 'all books';
      const countdown = this.getJumpCountdown();
      const banner = `${ANSI.inverse}${ANSI.magenta} [JUMP AROUND] (${scope}) ${ANSI.reset}${ANSI.magenta} Next jump in ${countdown} - Esc to stop ${ANSI.reset}`;
      
      // Center the banner
      const plainLen = ` [JUMP AROUND] (${scope})  Next jump in ${countdown} - Esc to stop `.length;
      const padding = Math.max(0, Math.floor((cols - plainLen) / 2));
      this.write(' '.repeat(padding) + banner);
    }
    
    // Auto-read indicator (only if not in Jump Around - they'd be redundant)
    if (this.autoRead.active && !this.jumpAround.active) {
      this.moveTo(rows - 3, 1);
      this.clearLine();
      const dir = this.autoRead.direction === 'forward' ? '>' : '<';
      const speed = (this.autoRead.intervalMs / 1000).toFixed(1);
      const banner = `${ANSI.inverse}${ANSI.green} AUTO ${dir} ${speed}s ${ANSI.reset}${ANSI.green} - Space to stop, +/- speed, x reverse ${ANSI.reset}`;
      this.write(banner);
    }
    
    // Status line
    this.moveTo(rows - 2, 1);
    this.clearLine();
    // Could show debug stats here if enabled
    
    // Controls
    this.moveTo(rows - 1, 1);
    this.clearLine();
    const controls = `${ANSI.dim}[wasd] nav [Space] auto [/] search [b] marks [r] random [[] size [h] help [q] quit${ANSI.reset}`;
    this.write(controls);
    
    this.moveTo(rows, 1);
  }
  
  private getJumpCountdown(): string {
    if (!this.jumpAround.active || !this.jumpAround.nextJumpTime) {
      return '--';
    }
    const remaining = Math.max(0, this.jumpAround.nextJumpTime - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    return `${seconds}s`;
  }
  
  private renderWithoutChrome(position: Position): void {
    this.clearScreen();
    console.log(position.formattedText || position.words.join(' '));
  }
  
  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split(/\n\n+/);
    
    for (const para of paragraphs) {
      if (para.trim() === '') {
        lines.push('');
        continue;
      }
      
      const subLines = para.split('\n');
      for (const subLine of subLines) {
        const words = subLine.split(/\s+/);
        let currentLine = '';
        
        for (const word of words) {
          if (!word) continue;
          if (currentLine.length === 0) {
            currentLine = word;
          } else if (currentLine.length + 1 + word.length <= maxWidth) {
            currentLine += ' ' + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);
      }
      lines.push('');
    }
    
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    return lines;
  }
  
  // ============================================================================
  // Modal Dialogs
  // ============================================================================
  
  showHelp(): void {
    this.clearScreen();
    console.log(`${ANSI.inverse} Gutex Help ${ANSI.reset}\n`);
    console.log(`${ANSI.bold}Navigation${ANSI.reset}`);
    console.log('  w d (up/rt) Move forward');
    console.log('  s a (dn/lt) Move backward');
    console.log('  PgUp/PgDn   Jump 10%');
    console.log('  g           Go to percent');
    console.log('  [ ]         Adjust chunk size\n');
    console.log(`${ANSI.bold}Auto-Read${ANSI.reset}`);
    console.log('  Space       Toggle auto-read');
    console.log('  x           Reverse direction');
    console.log('  + -         Speed up / slow down\n');
    console.log(`${ANSI.bold}Exploration${ANSI.reset}`);
    console.log('  r           Random menu');
    console.log('  j           Toggle jump around\n');
    console.log(`${ANSI.bold}Bookmarks & Search${ANSI.reset}`);
    console.log('  /           Search books');
    console.log('  b           View bookmarks');
    console.log('  B           Quick save bookmark\n');
    console.log(`${ANSI.bold}Other${ANSI.reset}`);
    console.log('  D           Toggle debug stats');
    console.log('  h ?         This help');
    console.log('  q           Quit');
    console.log('  Esc         Stop mode / Quit\n');
    console.log(`${ANSI.dim}Press any key to continue...${ANSI.reset}`);
  }
  
  async showSearch(keyboard: { prompt: (msg: string) => Promise<string> }): Promise<number | null> {
    this.clearScreen();
    console.log(`${ANSI.inverse} Search Books ${ANSI.reset}\n`);
    
    try {
      await this.catalog.ensureCatalog();
    } catch {
      console.log(`${ANSI.red}Catalog not available. Try: gutex --lookup "query" --refresh-catalog${ANSI.reset}`);
      console.log(`\n${ANSI.dim}Press Enter to continue...${ANSI.reset}`);
      await keyboard.prompt('');
      return null;
    }
    
    const query = await keyboard.prompt(`${ANSI.cyan}Search:${ANSI.reset} `);
    if (!query.trim()) return null;
    
    const results = this.catalog.searchCatalog(query).slice(0, 10);
    
    if (results.length === 0) {
      console.log(`\n${ANSI.yellow}No results found.${ANSI.reset}`);
      console.log(`${ANSI.dim}Press Enter to continue...${ANSI.reset}`);
      await keyboard.prompt('');
      return null;
    }
    
    console.log(`\n${ANSI.green}Found ${results.length} results:${ANSI.reset}\n`);
    
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const author = r.author ? ` ${ANSI.dim}by ${r.author}${ANSI.reset}` : '';
      console.log(`  ${ANSI.bold}${i + 1}${ANSI.reset}. [${r.id}] ${r.title}${author}`);
    }
    
    console.log();
    const choice = await keyboard.prompt(`${ANSI.cyan}Enter number (1-${results.length}) or book ID:${ANSI.reset} `);
    
    if (!choice.trim()) return null;
    
    const num = parseInt(choice, 10);
    if (num >= 1 && num <= results.length) {
      return parseInt(results[num - 1].id, 10);
    }
    if (num > 0) {
      return num;
    }
    
    return null;
  }
  
  async showBookmarks(
    keyboard: { prompt: (msg: string) => Promise<string> },
    currentPosition?: Position
  ): Promise<{ bookId: number; position: number } | null> {
    this.clearScreen();
    console.log(`${ANSI.inverse} Bookmarks ${ANSI.reset}\n`);
    
    const bookmarks = listBookmarks();
    const entries = Object.entries(bookmarks).sort(
      (a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0)
    );
    
    if (entries.length === 0) {
      console.log(`${ANSI.dim}No bookmarks yet.${ANSI.reset}`);
      console.log(`\nPress ${ANSI.bold}B${ANSI.reset} while reading to save a bookmark.`);
      console.log(`${ANSI.dim}Press Enter to continue...${ANSI.reset}`);
      await keyboard.prompt('');
      return null;
    }
    
    console.log(`${ANSI.dim}${entries.length} bookmarks:${ANSI.reset}\n`);
    
    const maxShow = Math.min(entries.length, 10);
    for (let i = 0; i < maxShow; i++) {
      const [name, info] = entries[i];
      const isCurrent = info.bookId === this.bookId && 
                        currentPosition && 
                        info.position === currentPosition.byteStart;
      const current = isCurrent ? ` ${ANSI.green}(here)${ANSI.reset}` : '';
      console.log(`  ${ANSI.bold}${i + 1}${ANSI.reset}. ${name}${current}`);
      console.log(`     ${ANSI.dim}Book ${info.bookId} · ${info.percent}${ANSI.reset}`);
    }
    
    if (entries.length > 10) {
      console.log(`  ${ANSI.dim}... and ${entries.length - 10} more${ANSI.reset}`);
    }
    
    console.log();
    const choice = await keyboard.prompt(`${ANSI.cyan}Enter number to open, or Enter to cancel:${ANSI.reset} `);
    
    if (!choice.trim()) return null;
    
    const num = parseInt(choice, 10);
    if (num >= 1 && num <= entries.length) {
      const info = entries[num - 1][1];
      return { bookId: info.bookId, position: info.position };
    }
    
    return null;
  }
  
  quickSaveBookmark(position: Position): string {
    const title = this.bookTitle || `Book ${this.bookId}`;
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    const name = `${title.slice(0, 25)} @ ${position.percent}% - ${timeStr}`;
    
    const info: BookmarkInfo = {
      bookId: this.bookId,
      position: position.byteStart,
      percent: position.percent,
      timestamp: Date.now(),
      title: this.bookTitle,
      author: this.bookAuthor,
      chunkSize: this.chunkSize
    };
    
    saveBookmark(name, info);
    return name;
  }
  
  async showGotoPercent(keyboard: { prompt: (msg: string) => Promise<string> }): Promise<number | null> {
    this.clearScreen();
    console.log(`${ANSI.inverse} Go To Position ${ANSI.reset}\n`);
    
    const input = await keyboard.prompt(`${ANSI.cyan}Enter percent (0-100):${ANSI.reset} `);
    
    if (!input.trim()) return null;
    
    const percent = parseInt(input, 10);
    if (!isNaN(percent) && percent >= 0 && percent <= 100) {
      return percent;
    }
    
    return null;
  }
  
  async showRandomMenu(
    keyboard: { promptChar: (msg: string, chars: string[]) => Promise<string | null> }
  ): Promise<'book' | 'location' | 'jump-all' | 'jump-book' | null> {
    this.clearScreen();
    console.log(`${ANSI.inverse} Random ${ANSI.reset}\n`);
    console.log(`  ${ANSI.bold}b${ANSI.reset}  Random Book     - Start a new book from beginning`);
    console.log(`  ${ANSI.bold}l${ANSI.reset}  Random Location - Random position in random book`);
    console.log(`  ${ANSI.bold}j${ANSI.reset}  Jump Around     - Continuous random (all books)`);
    console.log(`  ${ANSI.bold}t${ANSI.reset}  This Title      - Random position in current book`);
    console.log(`\n${ANSI.dim}Press a key or Esc to cancel...${ANSI.reset}`);
    
    const choice = await keyboard.promptChar('', ['b', 'l', 'j', 't']);
    
    switch (choice) {
      case 'b': return 'book';
      case 'l': return 'location';
      case 'j': return 'jump-all';
      case 't': return 'jump-book';
      default: return null;
    }
  }
  
  // ============================================================================
  // Status Messages
  // ============================================================================
  
  showLoading(bookId: number): void {
    if (this.showChrome) {
      console.log(`\n${ANSI.cyan}Loading book ${bookId}...${ANSI.reset}\n`);
    }
  }
  
  showTeleporting(bookId: number, percent: number): void {
    if (this.showChrome) {
      this.clearScreen();
      console.log(`\n${ANSI.magenta}>> Teleporting to book ${bookId} at ${percent}%...${ANSI.reset}\n`);
    }
  }
  
  showMessage(message: string): void {
    if (this.showChrome) {
      const { rows } = this.getSize();
      this.moveTo(rows - 2, 1);
      this.clearLine();
      this.write(`${ANSI.green}${message}${ANSI.reset}`);
    }
  }
  
  showError(message: string): void {
    const { rows } = this.getSize();
    this.moveTo(rows - 2, 1);
    this.clearLine();
    this.write(`${ANSI.red}Error: ${message}${ANSI.reset}`);
  }
  
  showGoodbye(): void {
    if (this.showChrome) {
      this.write(ANSI.showCursor);
      this.clearScreen();
      console.log('\nThanks for using Gutex!\n');
    }
  }
  
  showStats(stats: FetcherStats): void {
    if (this.showChrome) {
      console.log('Session Statistics:');
      console.log(`   HTTP Requests: ${stats.requests}`);
      console.log(`   Bytes Downloaded: ${stats.bytesDownloaded.toLocaleString()}`);
      console.log(`   Total Book Size: ${(stats.totalBytes ?? 0).toLocaleString()}`);
      console.log(`   Efficiency: ${stats.efficiency} of book downloaded`);
      console.log();
    }
  }
  
  async loadBookInfo(bookId: number): Promise<void> {
    try {
      await this.catalog.ensureCatalog();
      const record = this.catalog.getBookById(bookId);
      if (record) {
        this.bookTitle = record.title;
        if (record.author) {
          this.bookAuthor = record.author
            .replace(/,\s*\d{4}-\d{4}/g, '')
            .replace(/,\s*\d{4}-/g, '')
            .replace(/,\s*-\d{4}/g, '')
            .replace(/\s*\[.*?\]/g, '')
            .split('; ')
            .map(name => name.split(', ').reverse().join(' ').trim())
            .join(', ');
        }
      }
    } catch {
      // Catalog not available, no problem
    }
  }
  
  async showEndOfBookPrompt(
    keyboard: { promptChar: (msg: string, chars: string[]) => Promise<string | null> },
    direction: 'forward' | 'backward'
  ): Promise<boolean> {
    this.clearScreen();
    console.log(`${ANSI.inverse} End of Book ${ANSI.reset}\n`);
    
    if (direction === 'forward') {
      console.log(`You have reached the ${ANSI.bold}end${ANSI.reset} of this book.`);
    } else {
      console.log(`You have reached the ${ANSI.bold}beginning${ANSI.reset} of this book.`);
    }
    
    console.log(`\nWould you like the system to select a new book for you?\n`);
    console.log(`  ${ANSI.bold}y${ANSI.reset}  Yes, take me to a random book`);
    console.log(`  ${ANSI.bold}n${ANSI.reset}  No, stay here`);
    console.log(`\n${ANSI.dim}Press y/n or Esc to cancel...${ANSI.reset}`);
    
    const choice = await keyboard.promptChar('', ['y', 'n']);
    
    return choice === 'y';
  }

  async showQuotation(
    keyboard: { prompt: (msg: string) => Promise<string> },
    position: Position
  ): Promise<void> {
    this.clearScreen();
    console.log(`${ANSI.inverse} Quotation ${ANSI.reset}\n`);
    
    // Build the curl command
    const byteRange = `${position.byteStart}-${position.byteEnd}`;
    const url = `https://www.gutenberg.org/cache/epub/${this.bookId}/pg${this.bookId}.txt`;
    const curlCmd = `curl -s -r ${byteRange} "${url}"`;
    
    // Show book info
    console.log(`${ANSI.cyan}Book:${ANSI.reset} ${this.bookTitle || `Book ${this.bookId}`}`);
    if (this.bookAuthor) {
      console.log(`${ANSI.cyan}Author:${ANSI.reset} ${this.bookAuthor}`);
    }
    console.log(`${ANSI.cyan}Position:${ANSI.reset} ${position.percent}`);
    console.log(`${ANSI.cyan}Bytes:${ANSI.reset} ${position.byteStart} - ${position.byteEnd}`);
    console.log();
    
    // Show curl command in a box
    console.log(`${ANSI.dim}┌${'─'.repeat(Math.min(curlCmd.length + 2, 78))}┐${ANSI.reset}`);
    console.log(`${ANSI.dim}│${ANSI.reset} ${ANSI.yellow}${curlCmd}${ANSI.reset} ${ANSI.dim}│${ANSI.reset}`);
    console.log(`${ANSI.dim}└${'─'.repeat(Math.min(curlCmd.length + 2, 78))}┘${ANSI.reset}`);
    console.log();
    
    console.log(`${ANSI.dim}Copy the command above to fetch this exact passage.${ANSI.reset}`);
    console.log(`${ANSI.dim}Press Enter to continue...${ANSI.reset}`);
    await keyboard.prompt('');
  }
}
