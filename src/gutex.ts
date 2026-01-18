#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { CatalogManager } from './catalog-manager.js';
import { NetworkSearcher } from './network-search.js';
import { Fetcher } from './fetcher.js';

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

async function handleSearch(bookId: number, phrase: string, fuzzy: boolean): Promise<void> {
  const searcher = new NetworkSearcher(false);
  
  // Validate phrase
  const validation = searcher.validatePhrase(phrase);
  if (!validation.valid) {
    console.error(`\n❌ ${validation.error}\n`);
    process.exit(1);
  }
  
  console.error(`Searching book ${bookId} for: "${phrase}"${fuzzy ? ' (fuzzy)' : ''}...`);
  
  try {
    // Get file size for the book
    const fetcher = new Fetcher(bookId, false);
    const fileSize = await fetcher.getFileSize();
    
    // Create range fetcher using the Fetcher
    const rangeFetcher = async (start: number, end: number): Promise<Buffer> => {
      return fetcher.fetchRange(start, end);
    };
    
    // Build the URL for search
    const bookUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
    
    // Perform search
    const result = await searcher.search(bookUrl, phrase, {
      fuzzy,
      maxMatches: 50,
      maxEditDistance: fuzzy ? 2 : 0,
      contextSize: 150,
      rangeFetcher
    });
    
    if (!result.found || result.matches.length === 0) {
      console.error(`No matches found.\n`);
      console.error(`  Downloaded ${formatBytes(result.bytesDownloaded)} in ${result.chunksRequested} request(s)`);
      process.exit(0);
    }
    
    console.error(`Found ${result.matches.length} match${result.matches.length !== 1 ? 'es' : ''}`);
    console.error(`  Downloaded ${formatBytes(result.bytesDownloaded)} in ${result.chunksRequested} request(s)`);
    console.error('');
    
    // Output results - one per line with URL and curl command
    for (const match of result.matches) {
      const byteStart = match.byteStart;
      const chunkSize = match.matchedText.length + 200; // Include some context
      
      // Build gutex.app URL
      const gutexUrl = `https://gutex.app/read?excerpt=1#${bookId},${byteStart},${chunkSize}`;
      
      // Build curl command for byte range retrieval
      const curlCmd = `curl -H "Range: bytes=${byteStart}-${byteStart + chunkSize - 1}" ${bookUrl}`;
      
      // Output
      console.log(gutexUrl);
      console.log(curlCmd);
      
      // Add edit distance info for fuzzy matches
      if (match.editDistance > 0) {
        console.error(`  (edit distance: ${match.editDistance})`);
      }
    }
    
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Search error: ${message}\n`);
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
  gutex --search <bookId> "<phrase>"

Arguments:
  bookId        Project Gutenberg book ID (required for reading)
  chunkSize     Words per chunk (default: 200)
  startPercent  Starting position 0-100 (default: 0)

Options:
  --help, -h         Show this help
  --lookup <query>   Search catalog by title/author
  --search <id> <phrase>  Search within a book for a phrase (4+ words)
  --fuzzy            Enable fuzzy matching (use with --search)
  --refresh-catalog  Force re-download of catalog (use with --lookup)
  --snapshot         Print one chunk and exit (no REPL)
  --raw              Hide metadata in REPL mode

Examples:
  gutex 1342                      Pride and Prejudice, default settings
  gutex 996 50 25                 Don Quixote, 50 words, start at 25%
  gutex --snapshot 345 100 10    Dracula, print 100 words at 10% and exit
  gutex --lookup "Sherlock"      Search for Sherlock Holmes books
  gutex --lookup "Austen" --refresh-catalog   Search with fresh catalog
  gutex --search 7849 "stretched across his waistcoat"  Search The Trial

Search Output Format:
  Each match outputs two lines:
  1. https://gutex.app URL to read the excerpt
  2. curl command to retrieve the raw bytes

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
  let searchIndex = -1;
  let refreshCatalog = false;
  let fuzzy = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lookup') {
      lookupIndex = i;
    } else if (args[i] === '--search') {
      searchIndex = i;
    } else if (args[i] === '--refresh-catalog') {
      refreshCatalog = true;
    } else if (args[i] === '--fuzzy') {
      fuzzy = true;
    }
  }

  // Handle --search
  if (searchIndex !== -1) {
    if (searchIndex + 2 >= args.length) {
      console.error('\n❌ --search requires a book ID and search phrase\n');
      console.error('Usage: gutex --search <bookId> "<phrase>"');
      console.error('Example: gutex --search 7849 "stretched across his waistcoat"\n');
      process.exit(1);
    }

    const bookId = parseInt(args[searchIndex + 1], 10);
    if (isNaN(bookId)) {
      console.error('\n❌ Book ID must be a number\n');
      process.exit(1);
    }

    const phrase = args[searchIndex + 2];
    await handleSearch(bookId, phrase, fuzzy);
    return;
  }

  // Handle --lookup
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

  if (fuzzy) {
    console.error('\n❌ --fuzzy must be used with --search\n');
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

export { main, handleLookup, handleSearch };
