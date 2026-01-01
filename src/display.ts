/**
 * Display Module
 * Handles rendering of text with or without chrome (metadata)
 * Uses ANSI escape codes to pin controls to bottom of terminal
 */

import type { Position, DisplayOptions, TerminalSize, FetcherStats } from './types.js';

// ANSI escape codes
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  inverse: '\x1b[7m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  hide: '\x1b[?25l',
  show: '\x1b[?25h',
};

export interface ModeState {
  autoRead: boolean;
  autoDirection: 'forward' | 'backward';
  autoIntervalMs: number;
  jumpAround: boolean;
  jumpAroundSameBook: boolean;
  debug: boolean;
}

export interface BookInfo {
  title?: string;
  author?: string;
}

export class Display {
  private showChrome: boolean;
  public bookId: number;
  private bookInfo: BookInfo = {};
  private modeState: ModeState = {
    autoRead: false,
    autoDirection: 'forward',
    autoIntervalMs: 10000,
    jumpAround: false,
    jumpAroundSameBook: false,
    debug: false
  };
  private debugStats: FetcherStats | null = null;

  constructor(options: DisplayOptions = {}) {
    this.showChrome = options.showChrome !== false; // Default to true
    this.bookId = options.bookId ?? 0;
  }

  setBookInfo(info: BookInfo): void {
    this.bookInfo = info;
  }

  setModeState(state: Partial<ModeState>): void {
    Object.assign(this.modeState, state);
  }

  setDebugStats(stats: FetcherStats | null): void {
    this.debugStats = stats;
  }

  /**
   * Get display text, preferring formattedText if available
   */
  private _getText(position: Position): string {
    return position.formattedText || position.words.join(' ');
  }

  /**
   * Get terminal dimensions
   */
  private _getTerminalSize(): TerminalSize {
    return {
      rows: process.stdout.rows || 24,
      cols: process.stdout.columns || 80
    };
  }

  /**
   * Move cursor to specific row (1-indexed)
   */
  private _moveTo(row: number, col: number = 1): void {
    process.stdout.write(`\x1b[${row};${col}H`);
  }

  /**
   * Clear from cursor to end of screen
   */
  private _clearToEnd(): void {
    process.stdout.write('\x1b[J');
  }

  /**
   * Clear entire line
   */
  private _clearLine(): void {
    process.stdout.write('\x1b[2K');
  }

  /**
   * Clear entire screen and move to top
   */
  private _clearScreen(): void {
    // Use console.clear for testability, with ANSI fallback
    if (typeof console.clear === 'function') {
      console.clear();
    }
    process.stdout.write('\x1b[2J\x1b[H');
  }

  /**
   * Render the current position for REPL mode
   */
  render(position: Position): void {
    if (this.showChrome) {
      this._renderWithChrome(position);
    } else {
      this._renderWithoutChrome(position);
    }
  }

  /**
   * Render with full metadata (default mode)
   * Pins controls to the bottom of the terminal
   */
  private _renderWithChrome(position: Position): void {
    const { rows, cols } = this._getTerminalSize();

    // Clear screen
    this._clearScreen();
    process.stdout.write(ANSI.hide);

    // Header line with position info
    const wordRange = `${position.wordIndex}-${position.wordIndex + position.actualCount - 1}`;
    let header = `${ANSI.cyan}[Book ${this.bookId}]${ANSI.reset} `;
    header += `${ANSI.gray}Words ${wordRange}${ANSI.reset} `;
    header += `${ANSI.yellow}${position.percent}%${ANSI.reset}`;
    
    // Add mode indicators on the right
    const modes = this._getModeIndicators();
    const headerPlain = `[Book ${this.bookId}] Words ${wordRange} ${position.percent}%`;
    const modesPlain = modes.replace(/\x1b\[[0-9;]*m/g, '');
    
    if (modes && headerPlain.length + modesPlain.length + 2 < cols) {
      const padding = cols - headerPlain.length - modesPlain.length - 1;
      header += ' '.repeat(Math.max(1, padding)) + modes;
    }
    
    console.log(header);

    // Book info line (title/author)
    if (this.bookInfo.title || this.bookInfo.author) {
      let info = '';
      if (this.bookInfo.title) {
        info += `${ANSI.italic}${this.bookInfo.title}${ANSI.reset}`;
      }
      if (this.bookInfo.author) {
        info += ` ${ANSI.gray}by ${this.bookInfo.author}${ANSI.reset}`;
      }
      // Truncate if needed
      const infoPlain = info.replace(/\x1b\[[0-9;]*m/g, '');
      if (infoPlain.length > cols - 2) {
        const maxLen = cols - 6;
        info = `${ANSI.italic}${this.bookInfo.title?.slice(0, maxLen)}...${ANSI.reset}`;
      }
      console.log(info);
    } else {
      console.log();
    }

    // Book text - wrap to terminal width and limit height
    const text = this._getText(position);
    // Reserve lines: 2 header, 1 blank, 1 debug (optional), 1 controls, 1 buffer
    const debugLines = this.modeState.debug && this.debugStats ? 1 : 0;
    const maxTextRows = rows - 5 - debugLines;
    const wrappedLines = this._wrapText(text, cols - 1);
    const displayLines = wrappedLines.slice(0, maxTextRows);

    console.log(displayLines.join('\n'));

    // Debug stats (if enabled)
    if (this.modeState.debug && this.debugStats) {
      this._moveTo(rows - 2, 1);
      this._clearLine();
      const stats = this.debugStats;
      const debugLine = `${ANSI.blue}Reqs: ${stats.requests} | Bytes: ${stats.bytesDownloaded.toLocaleString()}/${(stats.totalBytes || 0).toLocaleString()} | ${stats.efficiency} | ${stats.mirror}${ANSI.reset}`;
      process.stdout.write(debugLine);
    }

    // Pin controls to bottom
    this._moveTo(rows - 1, 1);
    this._clearToEnd();
    const controls = `${ANSI.dim}[wasd] nav [Space] auto [/] search [b] marks [r] random [h] help [q] quit${ANSI.reset}`;
    console.log(controls);

    // Move cursor below controls (so it doesn't blink in the text)
    this._moveTo(rows, 1);
  }

  /**
   * Get mode indicator string for header
   */
  private _getModeIndicators(): string {
    const indicators: string[] = [];
    
    if (this.modeState.autoRead) {
      const dir = this.modeState.autoDirection === 'forward' ? '>' : '<';
      const speed = (this.modeState.autoIntervalMs / 1000).toFixed(1);
      indicators.push(`${ANSI.green}AUTO ${dir} ${speed}s${ANSI.reset}`);
    }
    
    if (this.modeState.jumpAround) {
      const scope = this.modeState.jumpAroundSameBook ? 'BOOK' : 'ALL';
      indicators.push(`${ANSI.magenta}JUMP ${scope}${ANSI.reset}`);
    }
    
    if (this.modeState.debug) {
      indicators.push(`${ANSI.blue}DEBUG${ANSI.reset}`);
    }
    
    return indicators.join(' ');
  }

  /**
   * Wrap text to fit terminal width
   */
  private _wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split(/\n\n+/);

    for (const para of paragraphs) {
      if (para.trim() === '') {
        lines.push('');
        continue;
      }

      // Handle single newlines within paragraphs
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

        if (currentLine) {
          lines.push(currentLine);
        }
      }

      // Add blank line between paragraphs
      lines.push('');
    }

    // Remove trailing blank lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    return lines;
  }

  /**
   * Render without metadata (--raw mode)
   */
  private _renderWithoutChrome(position: Position): void {
    this._clearScreen();
    console.log(this._getText(position));
  }

  /**
   * Print text for snapshot mode (no REPL, just text and exit)
   */
  static printSnapshot(position: Position): void {
    console.log(position.formattedText || position.words.join(' '));
  }

  /**
   * Show loading message
   */
  showLoading(bookId: number): void {
    if (this.showChrome) {
      console.log(`\nLoading book ${bookId}...\n`);
    }
  }

  /**
   * Show end of book prompt
   */
  showEndOfBook(bookId: number): void {
    this._clearScreen();
    console.log(`\nYou've reached the end of book ${bookId}!\n`);
    console.log('Choose your next move:\n');
    console.log(`  1. Move to book ${bookId + 1} (next)`);
    console.log(`  2. Move to book ${bookId - 1} (previous)`);
    console.log(`  3. Exit Gutex\n`);
  }

  /**
   * Show teleporting message
   */
  showTeleporting(bookId: number, percent: number): void {
    if (this.showChrome) {
      this._clearScreen();
      console.log(`\n>> Teleporting to book ${bookId} at ${percent}%...\n`);
    }
  }

  /**
   * Show goodbye message
   */
  showGoodbye(): void {
    if (this.showChrome) {
      process.stdout.write(ANSI.show);
      this._clearScreen();
      console.log('\nThanks for using Gutex!\n');
    }
  }

  /**
   * Show statistics
   */
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

  /**
   * Show help screen
   */
  showHelp(): void {
    this._clearScreen();
    console.log(`${ANSI.inverse} Gutex Help ${ANSI.reset}\n`);
    
    console.log(`${ANSI.bold}Navigation${ANSI.reset}`);
    console.log('  w d (up/rt) Move forward');
    console.log('  s a (dn/lt) Move backward');
    console.log('  g           Go to percent');
    console.log('  [ ]         Decrease/increase chunk size');
    console.log();
    
    console.log(`${ANSI.bold}Auto-Read${ANSI.reset}`);
    console.log('  Space       Toggle auto-read');
    console.log('  x           Reverse direction');
    console.log('  + -         Speed up/slow down');
    console.log();
    
    console.log(`${ANSI.bold}Random${ANSI.reset}`);
    console.log('  r           Random menu');
    console.log('  j           Toggle jump around');
    console.log();
    
    console.log(`${ANSI.bold}Bookmarks & Search${ANSI.reset}`);
    console.log('  /           Search books');
    console.log('  b           View bookmarks');
    console.log('  B           Quick save bookmark');
    console.log();
    
    console.log(`${ANSI.bold}Other${ANSI.reset}`);
    console.log('  c           Cite (show curl command)');
    console.log('  D           Toggle debug stats');
    console.log('  h ?         This help');
    console.log('  q Esc       Quit');
    console.log();
    
    console.log(`${ANSI.dim}Press any key to continue...${ANSI.reset}`);
  }

  /**
   * Show random menu
   */
  showRandomMenu(): void {
    this._clearScreen();
    console.log(`${ANSI.inverse} Random ${ANSI.reset}\n`);
    console.log(`  ${ANSI.bold}b${ANSI.reset}  Random Book      Start a new book from the beginning`);
    console.log(`  ${ANSI.bold}l${ANSI.reset}  Random Location  Random position in a random book`);
    console.log(`  ${ANSI.bold}j${ANSI.reset}  Jump Around      Continuous random jumping (all books)`);
    console.log(`  ${ANSI.bold}t${ANSI.reset}  This Title       Random position in current book`);
    console.log();
    console.log(`${ANSI.dim}Press a key to select, Esc to cancel${ANSI.reset}`);
  }

  /**
   * Show a transient message
   */
  showMessage(message: string): void {
    const { rows } = this._getTerminalSize();
    this._moveTo(rows - 2, 1);
    this._clearLine();
    process.stdout.write(`${ANSI.green}${message}${ANSI.reset}`);
    this._moveTo(rows, 1);
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    const { rows } = this._getTerminalSize();
    this._moveTo(rows - 2, 1);
    this._clearLine();
    process.stdout.write(`${ANSI.red}Error: ${message}${ANSI.reset}`);
    this._moveTo(rows, 1);
  }
}
