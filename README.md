# Gutex

Explore text at [Project Gutenberg](https://www.gutenberg.org).

## Install

```bash
git clone https://github.com/petethomas/gutex.git
cd gutex
npm install
npm run build
npm run web -- -p 3105
```

## Web

### Navigation

| Icon | Action | Key |
|------|--------|-----|
| :house: | Home / Landing page | — |
| :mag: | Search books | `/` |
| :bookmark: | Bookmarks & history | `b` |
| :game_die: | Random menu | `r` |
| :video_camera: | Toggle camera mode | `3` / `2` |
| :black_nib: | Annotation view | `c` |
| :busts_in_silhouette: | Reading rooms | `m` |
| ⤢ | Fullscreen | `z` |

### Search

Click :mag: to open the search dialog. Filter by language using the dropdown. Click any result to start reading.

### Annotations

Click :black_nib: or press `c` to open the current passage in a new tab. Shows:
- Text with smart quotes and ellipses
- Author and title attribution
- `curl` command to fetch the exact bytes from Gutenberg

### Bookmarks

Press `b` or click :bookmark: to open the bookmarks panel with two tabs:

**Bookmarks** — Save the current position with an optional name. Click any bookmark to return (preserves viewing mode).

**History** — Session log of everywhere you've navigated. Click to jump back.

### Random menu

Press `r` or click :game_die: to open four options:

| Key | Option | Description |
|-----|--------|-------------|
| `b` | Random Book | New book from the beginning |
| `l` | Random Location | Random position in a random book |
| `j` | Jump Around | Continuous random jumping across all books (60s intervals) |
| `t` | This Title | Continuous random within the current book |

### Camera mode

Press `3` or click :video_camera: to enable camera mode.

#### Camera controls

| Control | Action |
|---------|--------|
| `w` `d` `↑` `→` | Move forward |
| `a` `s` `↓` `←` | Move backward |
| Scroll / drag | Navigate |
| `Shift` + arrows | Rotate camera |
| `v` | Reset view |
| `2` | Exit camera mode |

A floating control pill appears in the corner with:
- **Speed slider**: Adjust auto-scroll rate
- **Progress**: Current position percentage
- **Through-line**: Toggle the connecting line through words
- **Position buttons**: Move the controls to any corner

The control pill is semi-transparent and collapsible to minimize visual obstruction.

### Themes

Use the theme dropdown or press `Shift+T` to cycle through visual themes:

| Icon | Theme |
|------|-------|
| :white_large_square: | Default (light) |
| :black_large_square: | Dark |
| :purple_circle: | Sci-Fi |
| :evergreen_tree: | Greenfield |
| :moyai: | Stoneworks |
| :bricks: | Redbrick |
| :crescent_moon: | Midnight |
| :large_orange_diamond: | Amber |

### Text size

Text size dropdown or `Shift+A` to cycle: small, normal, large.

### Language support

Search and random book selection can be filtered by language:

| Flag | Language |
|------|----------|
| :gb: | English |
| :de: | German |
| :fr: | French |
| :es: | Spanish |
| :it: | Italian |
| :portugal: | Portuguese |
| :netherlands: | Dutch |
| :finland: | Finnish |
| :cn: | Chinese |
| :jp: | Japanese |
| :classical_building: | Latin |
| :greece: | Greek |
| :earth_africa: | All languages |

### Reading rooms

Click :busts_in_silhouette: or press `m` to open the reading rooms panel.

**Creating a room:**
1. Enter a display name
2. Click "Start a Room"
3. Share the 6-character room code (shown in blue banner)

**Joining a room:**
1. Enter a display name and room code
2. Click "Join"

**Features:**
- Picture-in-Picture windows show what others are reading
- Works in both text and camera modes
- Followers see book title, author, and position percentage
- Independent browsing while following (PIP only)

Room state is ephemeral. Broadcast rate is 4 updates/second.

### Auto-read

Press `Space` to toggle auto-read. Use the header controls to configure:
- Chunk size (words per screen)
- Interval (seconds between chunks)
- Direction (forward/backward)

Press `x` to reverse direction. The :robot: button starts/stops auto-read.

### Web keyboard reference

| Key | Action |
|-----|--------|
| `↑` `→` `w` `d` | Forward |
| `↓` `←` `s` `a` | Backward |
| `Scroll wheel` | Navigate at scroll boundary |
| `Space` | Toggle auto-read |
| `x` | Reverse auto-read direction |
| `/` | Search |
| `r` | Random menu |
| `j` | Toggle jump around |
| `b` | Bookmarks and history |
| `c` | Annotation view |
| `z` | Fullscreen |
| `3` | Enter camera mode |
| `2` | Exit camera mode |
| `v` | Reset camera view |
| `Shift` + arrows | Rotate camera |
| `m` | Reading rooms panel |
| `Esc` | Stop auto / close modal |
| `PageUp` / `PageDown` | Jump navigation |
| `Shift` + `T` | Cycle theme |
| `Shift` + `A` | Cycle text size |

## Terminal

Terminal UI for reading in a text-based interface.

```bash
node dist/src/gutex.js --help

Usage: ./gutex [options] <bookId> [chunkSize] [startPercent]

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
```

### Terminal keyboard controls

| Key | Action |
|-----|--------|
| `↑` `→` `w` `d` | Move forward |
| `↓` `←` `s` `a` | Move backward |
| `g` | Go to percent |
| `[` `]` | Decrease/increase chunk size |
| `Space` | Toggle auto-read |
| `x` | Reverse direction |
| `+` `-` | Speed up/slow down (0.5-10s) |
| `r` | Random menu |
| `j` | Toggle jump around mode |
| `/` | Search books |
| `b` | View bookmarks |
| `B` | Quick save bookmark |
| `c` | Annotation view |
| `D` | Toggle debug stats |
| `h` `?` | Show help |
| `q` `Esc` | Quit |

### Terminal features

- **Catalog search**: `--lookup` searches by title or author
- **Snapshot mode**: `--snapshot` prints one chunk and exits
- **Raw mode**: `--raw` hides position metadata
- **Bookmarks**: Shared with web mode via `~/.gutex_bookmarks.json`
- **Auto-read**: Configurable speed and direction
- **Jump around**: Random navigation within or across books

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/search?q=query` | Search catalog |
| `GET /api/random` | Random book (verified to have text) |
| `GET /api/bookinfo/:id` | Title and author |
| `GET /api/book/:id/init?chunkSize=200` | Initialize book, get first chunk |
| `GET /api/book/:id/chunk?byteStart=N&chunkSize=200` | Get chunk at position |
| `GET /api/bookmarks` | List all bookmarks |
| `POST /api/bookmarks` | Save bookmark `{name, info}` |
| `DELETE /api/bookmarks/:name` | Delete bookmark |
| `GET /api/lastpos` | Get last reading position |
| `POST /api/lastpos` | Save last reading position |
| `DELETE /api/lastpos` | Clear last reading position |
| `GET /api/mirrors` | Mirror status and health |
| `GET /api/cache` | Sparse cache status |
| `GET /api/cache/:id` | Book cache status |
| `DELETE /api/cache/:id` | Invalidate book cache |
| `GET /api/debug` | Recent requests and events |
| `GET /api/p2p/rooms` | Active reading rooms |
| `WS /ws/signaling` | WebSocket for reading rooms |

Chunk responses include `nextByteStart`, `previousByteEnd`, `percent`, document boundaries, and actual word count.

### WebSocket messages

| Type | Direction | Purpose |
|------|-----------|---------|
| `create-room` | Client→Server | Create room, receive code |
| `join-room` | Client→Server | Join by code |
| `leave-room` | Client→Server | Exit room |
| `room-info` | Server→Client | Room details, peer list |
| `peer-list` | Server→Client | Peer joined/left updates |
| `stream-state` | Bidirectional | Reading/search state sharing |

## Files

```
gutex              CLI entry point
gutex-web          Web server entry point
src/
  bookmarks.ts     Position persistence (~/.gutex_bookmarks.json)
  cached-fetcher.ts  Sparse cache integration
  last-position.ts Last reading position (~/.gutex_lastpos.json)
  catalog-manager.ts  Search, catalog download, random selection
  cleaner.ts       Header/footer detection with fuzzy matching
  cli-options.ts   Argument parser
  display.ts       Terminal output
  fetcher.ts       HTTP range requests
  gutex-enhanced.ts  CLI orchestrator
  keyboard.ts      CLI key handling
  mirror-manager.ts  Parallel racing, health tracking, fallback
  navigator.ts     Chunk fetching, caching, word extraction, history
  p2p-signaling.ts WebSocket relay for reading rooms
  snapshot-runner.ts  --snapshot mode
  sparse-cache.ts  Content boundary caching
  terminal-ui.ts   Terminal rendering and UI
  web-landing.html Search page
  web-server.ts    API server
  web-ui/          Reader UI (camera mode, bookmarks, reading rooms)
    build-web-ui.js
    tsconfig.json
    web-ui-all.ts
    web-ui-template.html
    web-ui.css
```

## Implementation notes

### Content boundary detection

Project Gutenberg files include license headers and footers that aren't part of the actual book. The cleaner module finds real content boundaries using:

- **Marker patterns:** Looks for "START OF THIS PROJECT GUTENBERG EBOOK" and similar variants (PG Australia uses different phrasing)
- **Fuzzy matching:** Bounded Levenshtein distance (≤6 edits) catches OCR errors and typos in scanned texts
- **Legacy handling:** Detects old "SMALL PRINT" disclaimer blocks from pre-2000 uploads
- **Fallback:** If no markers found, uses statistical sampling at 10% and 60% to estimate content boundaries

### In-memory LRU cache

The navigator maintains a 10-chunk LRU cache for back/forward navigation:

- **Key structure:** `bookId:byteStart:byteEnd`
- **Eviction:** Least-recently-used chunk dropped when cache is full
- **Prefetching:** After each navigation, queues fetches for adjacent chunks—primary direction at 10ms delay, opposite direction at 100ms
- **Hit rate:** Typical reading sessions see 80%+ cache hits after warmup

### Byte-level navigation

Navigation tracks byte positions for reversibility:

- **Symmetric tracking:** Stores `previousByteEnd` and `nextByteStart` so forward-then-backward returns to same text
- **History stack:** 50-position stack undo; separate future stack for redo after backward navigation
- **Word extraction:** Requests 2.5× expected bytes, extracts N words, records byte boundaries
- **UTF-8 safety:** Adds 3-byte margins on Range requests to avoid splitting multi-byte characters

### Mirror racing

On first request for each book, the mirror manager races multiple servers:

1. Downloads `MIRRORS.ALL` from gutenberg.org at startup
2. Selects top 3 mirrors by geographic proximity and past performance
3. Fires parallel HEAD requests, uses first successful response
4. Winning mirror becomes "sticky" for subsequent requests to that book
5. Failed mirrors get exponential backoff; repeated failures trigger demotion
6. Falls back to gutenberg.org if all mirrors fail

### Sparse cache

The sparse cache is a local disk cache that stores only the byte ranges read from each book, not the entire file.

**How it works:**

1. When a book is first requested, the cache creates a sparse file pre-allocated to the book's full size
2. A bitmap tracks which 4KB blocks have been fetched—one bit per block
3. When a byte range is requested, the cache checks which blocks are missing, coalesces nearby gaps (up to 8KB) into single requests, fetches only what's needed, and writes it into the correct position in the sparse file
4. Subsequent reads of the same passage hit disk instead of network

**Validation:** The cache stores each book's ETag and Last-Modified headers. Every 24 hours it revalidates against the upstream server—if the file changed, the cache is invalidated.

**Graceful degradation:** If anything goes wrong (corrupt bitmap, disk full, validation failure), the cache transparently falls back to network fetches.

**Disk layout:**
```
.cache/
  books/
    1342.txt       # Sparse file with cached byte ranges
    1342.meta      # JSON metadata (size, etag, timestamps)
    1342.bitmap    # Bit array tracking cached blocks
```

**Stats:** Run with `--debug` or check the debug panel (🐛) to see per-book cache coverage percentages.

### Reading rooms (P2P)

Reading rooms use WebSocket relay for shared reading sessions:

- **Room model:** Creator broadcasts position; others in the room see synchronized text
- **State sync:** Position updates flow through the server to all room members  

### Camera rendering

Camera mode renders text along a curve line.

- **Perspective math:** Projects coordinates to canvas with configurable FOV
- **Word positioning:** Places words along a parametric curve, handles line wrapping
- **Italic detection:** Parses `_underscore_` markers in source text, renders with CSS font-style
- **Momentum scrolling:** Physics-based velocity with configurable friction for smooth navigation
- **Chunk loading:** Detects when view approaches chunk boundaries, loads adjacent text seamlessly

## Tests

```bash
npm test
```

700+ tests covering navigation, caching, UI behavior, UTF-8 safety, P2P signaling, more. Some tests hit gutenberg.org.

## Some eBook IDs

| ID | Title |
|----|-------|
| 1342 | Pride and Prejudice |
| 11 | Alice in Wonderland |
| 1661 | Sherlock Holmes |
| 84 | Frankenstein |
| 345 | Dracula |
| 2701 | Moby Dick |
| 174 | Dorian Gray |
| 98 | Tale of Two Cities |
| 996 | Don Quixote |
| 6920 | Meditations |

## License

[MPL 2.0](https://en.wikipedia.org/wiki/Mozilla_Public_License)

## Attribution

Code generated by Claude Opus 4.5
