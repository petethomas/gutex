/**
 * CLI Options Parser
 * Handles command-line argument parsing including flags like --snapshot and --raw
 */

export class CliOptions {
  constructor(argv = process.argv.slice(2)) {
    this.snapshot = false;
    this.raw = false;
    this.bookId = null;
    this.chunkSize = null;
    this.startPercent = null;
    this.errors = [];
    
    this._parse(argv);
  }
  
  _parse(argv) {
    const args = [];
    
    // Separate flags from positional arguments
    for (const arg of argv) {
      if (arg.startsWith('--')) {
        const flag = arg.slice(2);
        if (flag === 'snapshot') {
          this.snapshot = true;
        } else if (flag === 'raw') {
          this.raw = true;
        } else {
          this.errors.push(`Unknown flag: ${arg}`);
        }
      } else {
        args.push(arg);
      }
    }
    
    // Parse positional arguments
    if (args.length !== 3) {
      this.errors.push('Expected exactly 3 positional arguments: <bookId> <chunkSize> <startPercent>');
      return;
    }
    
    const [bookId, chunkSize, startPercent] = args.map(arg => parseInt(arg, 10));
    
    if (isNaN(bookId) || isNaN(chunkSize) || isNaN(startPercent)) {
      this.errors.push('All arguments must be numbers');
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
  
  isValid() {
    return this.errors.length === 0;
  }
  
  getErrorMessage() {
    if (this.errors.length === 0) {
      return null;
    }
    
    return '\n❌ ' + this.errors.join('\n❌ ') + '\n';
  }
  
  getUsageMessage() {
    return `
Usage: ./gutex [options] <bookId> <chunkSize> <startPercent>

Options:
  --snapshot    Print text at position and exit (no REPL)
  --raw    Suppress metadata display in REPL mode

Examples:
  ./gutex 996 7 36
  ./gutex --snapshot 996 7 36
  ./gutex --raw 996 7 36
`;
  }
}
