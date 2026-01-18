# Changes

## v0.2.0 (2026-01-17): Network-Efficient Fulltext Search with Excerpt Builder

### Summary

Added fulltext search within books using HTTP byte-range requests, avoiding full file downloads. Search results feed into a new excerpt builder that lets users precisely select text boundaries word-by-word and generate shareable excerpt links.

### New Features

**Fulltext Search (`/api/textsearch/:bookId`)**

- Search within any book using 4+ word phrases
- Two search strategies based on file size:
  - Files < 50KB: full download (faster for small files)
  - Files ≥ 50KB: streaming byte-range search
- Exact matching via Knuth-Morris-Pratt (KMP) algorithm
- Fuzzy matching via Bitap algorithm with configurable edit distance
- Adaptive chunk sizing: starts at 16KB, grows to 128KB after consecutive misses
- Integrates with SparseCache for automatic caching of fetched ranges

**Excerpt Builder UI**

- Click ✂️ on any search result to open the excerpt builder
- Word-level boundary controls: `−word` / `+word` for start and end
- Live preview shows exactly what text will appear in the excerpt
- Byte position display updates in real-time
- "Open Excerpt" opens the selection in a new tab
- "Copy Link" copies the shareable URL

**Exact Byte Fetching**

- New `exact=1` parameter on `/api/book/:id/chunk` endpoint
- Returns raw bytes without word alignment
- Excerpt view now shows precisely the selected text, not expanded chunks

### Technical Details

**New Files**

- `src/network-search.ts` — KMP, Bitap, adaptive chunking, NetworkSearcher class
- `src/web-landing/modules/07-fulltext.ts` — Search UI and excerpt builder
- `test/network-search.test.ts` — 35 tests for search algorithms

**Algorithm Notes**

- KMP: O(n+m) streaming search, O(m) state, never backtracks
- Bitap: O(1) state updates via bit-parallel operations, limited to 31-char patterns (falls back to word-level Levenshtein for longer)
- Chunk overlap equals pattern length minus one to catch boundary-spanning matches

**Caching Integration**

- `SearchOptions.rangeFetcher` accepts an injected fetch function
- Server binds SparseCache when available: `(start, end) => sparseCache.getRange(bookId, start, end)`
- Subsequent searches for the same book regions hit cache

### API Changes

| Endpoint | Change |
|----------|--------|
| `GET /api/textsearch/:bookId?q=phrase&fuzzy=true&max=N` | New |
| `GET /api/book/:id/chunk?...&exact=1` | Added `exact` parameter |

### Test Coverage

781 tests total (up from ~745). New tests cover:
- KMP streaming across chunk boundaries
- Bitap fuzzy matching with edit distances 0-3
- Pattern length edge cases (1 char, 31 chars, >31 chars)
- RangeFetcher injection for caching
- Levenshtein distance calculations
