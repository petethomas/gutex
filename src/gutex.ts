#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { CatalogManager } from './catalog-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function handleLookup(searchQuery: string, refreshCatalog: boolean): Promise<void> {
  const catalog = new CatalogManager();

  try {
    await catalog.ensureCatalog(refreshCatalog);
    const results = catalog.searchCatalog(searchQuery);

    if (results.length === 0) {
      console.log(`No results found for: "${searchQuery}"\n`);
      return;
    }

    console.log(`Found ${results.length} result${results.length === 1 ? '' : 's'} for: "${searchQuery}"\n`);

    for (const { id, title } of results) {
      console.log(`    --> [${id}] "${title}"`);
    }

    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Error: ${message}\n`);
    process.exit(1);
  }
}

function delegateToCore(args: string[]): void {
  const corePath = path.join(__dirname, 'gutex-core.js');

  const child = spawn(process.execPath, [corePath, ...args], {
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });

  child.on('error', (err) => {
    console.error(`\n❌ Failed to start gutex-core: ${err.message}\n`);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --help first
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
gutex - Explore text at Project Gutenberg

Usage:
  gutex [options] <bookId> [chunkSize] [startPercent]
  gutex --lookup <query>

Arguments:
  bookId        Project Gutenberg book ID (required for reading)
  chunkSize     Words per chunk (default: 200)
  startPercent  Starting position 0-100 (default: 0)

Options:
  --help, -h         Show this help
  --lookup <query>   Search catalog by title/author
  --refresh-catalog  Force re-download of catalog (use with --lookup)
  --snapshot         Print one chunk and exit (no REPL)
  --raw              Hide metadata in REPL mode

Examples:
  gutex 1342                      Pride and Prejudice, default settings
  gutex 996 50 25                 Don Quixote, 50 words, start at 25%
  gutex --snapshot 345 100 10    Dracula, print 100 words at 10% and exit
  gutex --lookup "Sherlock"      Search for Sherlock Holmes books
  gutex --lookup "Austen" --refresh-catalog   Search with fresh catalog

Keyboard Controls (in REPL mode):
  Navigation:
    ↑ → w d    Move forward
    ↓ ← s a    Move backward
    g          Go to percent
    [ ]        Decrease/increase chunk size

  Auto-Read:
    Space      Toggle auto-read
    x          Reverse direction
    + -        Speed up/slow down (0.5-10s)

  Random:
    r          Random menu (book/location/jump around)
    j          Toggle jump around mode

  Bookmarks:
    /          Search books (interactive)
    b          View bookmarks
    B          Quick save bookmark

  Other:
    D          Toggle debug stats
    h ?        Show help
    q Esc      Quit

Web UI:
  gutex-web                       Start web server on port 3000
  gutex-web -p 8080               Start on port 8080
`);
    process.exit(0);
  }

  let lookupIndex = -1;
  let refreshCatalog = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lookup') {
      lookupIndex = i;
    } else if (args[i] === '--refresh-catalog') {
      refreshCatalog = true;
    }
  }

  if (lookupIndex !== -1) {
    if (lookupIndex + 1 >= args.length) {
      console.error('\n❌ --lookup requires a search string argument\n');
      console.error('Usage: gutex --lookup <search-string>');
      console.error('Example: gutex --lookup "Don Qui"\n');
      process.exit(1);
    }

    const searchQuery = args[lookupIndex + 1];
    await handleLookup(searchQuery, refreshCatalog);
    return;
  }

  if (refreshCatalog) {
    console.error('\n❌ --refresh-catalog must be used with --lookup\n');
    process.exit(1);
  }

  delegateToCore(args);
}

// Main execution check
const modulePath = fileURLToPath(import.meta.url);
const scriptPath = process.argv[1];

if (scriptPath && (modulePath.endsWith(scriptPath) || scriptPath.endsWith('gutex') || scriptPath.endsWith('gutex.js'))) {
  main().catch(err => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Fatal error: ${message}\n`);
    if (process.env.DEBUG === '1' && err instanceof Error) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}

export { main, handleLookup };
