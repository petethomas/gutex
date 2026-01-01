/**
 * CLI Options Parser
 * Handles command-line argument parsing including flags like --snapshot and --raw
 */

import type { CliOptionsData } from './types.js';

export class CliOptions implements CliOptionsData {
  snapshot: boolean = false;
  raw: boolean = false;
  bookId: number | null = null;
  chunkSize: number | null = null;
  startPercent: number | null = null;
  errors: string[] = [];

  constructor(argv: string[] = process.argv.slice(2)) {
    this._parse(argv);
  }

  private _parse(argv: string[]): void {
    const args: string[] = [];

    // Separate flags from positional arguments
    for (const arg of argv) {
      if (arg.startsWith('--')) {
        const flag = arg.slice(2);
        if (flag === 'snapshot') {
          this.snapshot = true;
        } else if (flag === 'raw') {
          this.raw = true;
        } else if (flag === 'help') {
          // Handled by wrapper, ignore here
        } else if (flag === 'lookup' || flag === 'refresh-catalog') {
          // Handled by wrapper, ignore here
        } else {
          this.errors.push(`Unknown flag: ${arg}`);
        }
      } else if (arg === '-h') {
        // Short help, handled by wrapper
      } else {
        args.push(arg);
      }
    }

    // Parse positional arguments (1-3 required, with defaults)
    if (args.length < 1 || args.length > 3) {
      this.errors.push('Expected 1-3 positional arguments: <bookId> [chunkSize] [startPercent]');
      return;
    }

    const bookId = parseInt(args[0], 10);
    const chunkSize = args[1] ? parseInt(args[1], 10) : 200;
    const startPercent = args[2] ? parseInt(args[2], 10) : 0;

    if (isNaN(bookId)) {
      this.errors.push('Book ID must be a number');
      return;
    }

    if (isNaN(chunkSize)) {
      this.errors.push('Chunk size must be a number');
      return;
    }

    if (isNaN(startPercent)) {
      this.errors.push('Start percent must be a number');
      return;
    }

    this.bookId = bookId;
    this.chunkSize = chunkSize;
    this.startPercent = startPercent;

    if (chunkSize < 1) {
      this.errors.push('Chunk size must be at least 1');
    }

    if (startPercent < 0 || startPercent > 100) {
      this.errors.push('Start percent must be between 0 and 100');
    }
  }

  isValid(): boolean {
    return this.errors.length === 0;
  }

  getErrorMessage(): string | null {
    if (this.errors.length === 0) {
      return null;
    }

    return '\n❌ ' + this.errors.join('\n❌ ') + '\n';
  }

  getUsageMessage(): string {
    return `
Usage: ./gutex [options] <bookId> [chunkSize] [startPercent]

Run './gutex --help' for full usage information.

Quick examples:
  ./gutex 1342                 Read Pride and Prejudice
  ./gutex 1342 50              Same, 50 words per chunk
  ./gutex --lookup "Dracula"   Search for books
`;
  }
}
