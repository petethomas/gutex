// @ts-nocheck
// ========== Network-efficient fulltext search ==========
// Uses server-side range-based search to avoid downloading entire books

interface NetworkSearchMatch {
  position: number;
  matchedText: string;
  context: string;
  editDistance: number;
  byteStart: number;
}

interface NetworkSearchResult {
  found: boolean;
  matches: NetworkSearchMatch[];
  bytesDownloaded: number;
  chunksRequested: number;
  searchTimeMs: number;
  strategy: 'full-download' | 'range-search';
  bookId: number;
  phrase: string;
  fuzzy: boolean;
}

// Word with its byte position
interface WordInfo {
  word: string;
  byteStart: number;
  byteEnd: number;
}

// Excerpt builder state - tracks words and their byte positions
const excerptBuilder = {
  visible: false,
  match: null as NetworkSearchMatch | null,
  // Array of words with their byte positions
  words: [] as WordInfo[],
  // Current selection as word indices (inclusive)
  startWordIdx: 0,
  endWordIdx: 0
};

async function performNetworkSearch(
  bookId: number, 
  phrase: string, 
  fuzzy: boolean = false
): Promise<NetworkSearchResult> {
  const params = new URLSearchParams({
    q: phrase,
    fuzzy: fuzzy.toString(),
    max: '100'
  });
  
  const response = await fetch(`/api/textsearch/${bookId}?${params}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Search failed: ${response.status}`);
  }
  
  return response.json();
}

async function openFulltextSearch(bookId: number, bookTitle: string, bookAuthor: string): Promise<void> {
  // Reset state
  fulltextState.bookId = bookId;
  fulltextState.bookTitle = bookTitle;
  fulltextState.bookAuthor = bookAuthor;
  fulltextState.results = [];
  fulltextState.loading = false;
  
  // Update UI
  const overlay = $('fulltextOverlay');
  const title = $('fulltextTitle');
  const status = $('fulltextStatus');
  const results = $('fulltextResults');
  const query = $('fulltextQuery') as HTMLInputElement | null;
  
  if (overlay) overlay.classList.add('visible');
  if (title) title.textContent = `Search: ${bookTitle}`;
  if (status) status.innerHTML = `
    <div class="search-hint">
      Enter at least <strong>4 words</strong> to search efficiently.<br>
      <small>Network-efficient search uses byte-range requests.</small>
    </div>
  `;
  if (results) results.innerHTML = '';
  if (query) {
    query.value = '';
    query.disabled = false;
    query.placeholder = 'Enter 4+ words to search...';
    query.focus();
  }
  
  // Hide excerpt builder if visible
  closeExcerptBuilder();
}

function closeFulltextSearch(): void {
  const overlay = $('fulltextOverlay');
  if (overlay) overlay.classList.remove('visible');
  closeExcerptBuilder();
}

async function performFulltextSearch(): Promise<void> {
  const queryEl = $('fulltextQuery') as HTMLInputElement | null;
  const fuzzyEl = $('fulltextFuzzy') as HTMLInputElement | null;
  const statusEl = $('fulltextStatus');
  const resultsEl = $('fulltextResults');
  
  if (!queryEl || !statusEl || !resultsEl) return;
  
  const phrase = queryEl.value.trim();
  const bookId = fulltextState.bookId;
  
  if (!bookId) {
    statusEl.textContent = 'No book selected';
    return;
  }
  
  // Check word count
  const words = phrase.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 4) {
    statusEl.innerHTML = `
      <div class="search-hint">
        Enter at least <strong>4 words</strong> (currently ${words.length}).<br>
        <small>This enables network-efficient byte-range search.</small>
      </div>
    `;
    resultsEl.innerHTML = '';
    fulltextState.results = [];
    return;
  }
  
  const fuzzy = fuzzyEl?.checked || false;
  
  // Show loading state
  statusEl.innerHTML = `<div class="searching">Searching...</div>`;
  resultsEl.innerHTML = '';
  queryEl.disabled = true;
  
  try {
    const result = await performNetworkSearch(bookId, phrase, fuzzy);
    
    queryEl.disabled = false;
    
    if (!result.found || result.matches.length === 0) {
      statusEl.innerHTML = `
        <div class="no-results">
          No matches found.<br>
          <small>Downloaded ${formatBytes(result.bytesDownloaded)} in ${result.chunksRequested} request(s)</small>
        </div>
      `;
      fulltextState.results = [];
      return;
    }
    
    // Store results
    fulltextState.results = result.matches;
    
    // Show stats
    const strategyLabel = result.strategy === 'full-download' 
      ? 'full download' 
      : `${result.chunksRequested} range request(s)`;
    
    statusEl.innerHTML = `
      <div class="search-stats">
        <strong>${result.matches.length}</strong> match${result.matches.length !== 1 ? 'es' : ''} found
        ${fuzzy ? `<span class="fuzzy-badge">fuzzy</span>` : ''}
        <br>
        <small>
          ${formatBytes(result.bytesDownloaded)} via ${strategyLabel} · ${result.searchTimeMs}ms
        </small>
      </div>
    `;
    
    // Render results with excerpt button
    resultsEl.innerHTML = result.matches.map((m, idx) => `
      <div class="result-item" data-idx="${idx}">
        <div class="match-context">
          ${escapeHtml(m.context.slice(0, m.context.toLowerCase().indexOf(m.matchedText.toLowerCase())))}
          <span class="match-highlight">${escapeHtml(m.matchedText)}</span>
          ${escapeHtml(m.context.slice(m.context.toLowerCase().indexOf(m.matchedText.toLowerCase()) + m.matchedText.length))}
        </div>
        <div class="match-actions">
          <span class="match-position">Byte ${m.byteStart.toLocaleString()}</span>
          ${m.editDistance > 0 ? `<span class="edit-distance">~${m.editDistance} edits</span>` : ''}
          <button class="excerpt-btn" data-idx="${idx}" title="Create excerpt link">✂️ Excerpt</button>
        </div>
      </div>
    `).join('');
    
    // Add click handlers
    resultsEl.querySelectorAll('.result-item').forEach((item: Element) => {
      // Click on result (not button) jumps to position
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('excerpt-btn')) return;
        const idx = parseInt((item as HTMLElement).dataset.idx || '0', 10);
        const match = result.matches[idx];
        if (match) jumpToBytePosition(match.byteStart);
      });
    });
    
    // Excerpt button handlers
    resultsEl.querySelectorAll('.excerpt-btn').forEach((btn: Element) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.idx || '0', 10);
        const match = result.matches[idx];
        if (match) openExcerptBuilder(match);
      });
    });
    
  } catch (err) {
    queryEl.disabled = false;
    statusEl.innerHTML = `
      <div class="search-error">
        ${escapeHtml((err as Error).message)}
      </div>
    `;
  }
}

async function openExcerptBuilder(match: NetworkSearchMatch): Promise<void> {
  excerptBuilder.match = match;
  excerptBuilder.visible = true;
  
  // Fetch raw bytes around the match for word-boundary detection
  // Get ~500 bytes before and after to have room for adjustment
  const expandStart = Math.max(0, match.byteStart - 500);
  const expandSize = match.matchedText.length + 1000;
  
  try {
    // Fetch raw text (exact bytes, not word-aligned)
    const response = await fetch(
      `/api/book/${fulltextState.bookId}/chunk?byteStart=${expandStart}&chunkSize=${expandSize}&exact=1`
    );
    const data = await response.json();
    const rawText = data.text || match.context;
    const actualByteStart = data.byteStart ?? expandStart;
    
    // Parse into words with byte positions
    excerptBuilder.words = parseWordsWithPositions(rawText, actualByteStart);
    
    // Find which words contain the match
    const matchByteEnd = match.byteStart + match.matchedText.length;
    let startIdx = 0;
    let endIdx = excerptBuilder.words.length - 1;
    
    for (let i = 0; i < excerptBuilder.words.length; i++) {
      const w = excerptBuilder.words[i];
      if (w.byteStart <= match.byteStart && w.byteEnd > match.byteStart) {
        startIdx = i;
      }
      if (w.byteStart < matchByteEnd && w.byteEnd >= matchByteEnd) {
        endIdx = i;
        break;
      }
    }
    
    excerptBuilder.startWordIdx = startIdx;
    excerptBuilder.endWordIdx = endIdx;
    
  } catch {
    // Fall back to simple parsing of match context
    excerptBuilder.words = parseWordsWithPositions(match.context, match.byteStart - 50);
    excerptBuilder.startWordIdx = 0;
    excerptBuilder.endWordIdx = Math.max(0, excerptBuilder.words.length - 1);
  }
  
  renderExcerptBuilder();
}

// Parse text into words with their byte positions
function parseWordsWithPositions(text: string, startByte: number): WordInfo[] {
  const words: WordInfo[] = [];
  const encoder = new TextEncoder();
  
  let charIdx = 0;
  let byteIdx = startByte;
  
  while (charIdx < text.length) {
    // Skip whitespace
    while (charIdx < text.length && /\s/.test(text[charIdx])) {
      const charBytes = encoder.encode(text[charIdx]).length;
      byteIdx += charBytes;
      charIdx++;
    }
    
    if (charIdx >= text.length) break;
    
    // Collect word
    const wordStart = charIdx;
    const wordByteStart = byteIdx;
    
    while (charIdx < text.length && !/\s/.test(text[charIdx])) {
      const charBytes = encoder.encode(text[charIdx]).length;
      byteIdx += charBytes;
      charIdx++;
    }
    
    const word = text.slice(wordStart, charIdx);
    if (word.length > 0) {
      words.push({
        word,
        byteStart: wordByteStart,
        byteEnd: byteIdx
      });
    }
  }
  
  return words;
}

function closeExcerptBuilder(): void {
  excerptBuilder.visible = false;
  excerptBuilder.match = null;
  excerptBuilder.words = [];
  const builder = $('excerptBuilder');
  if (builder) builder.classList.remove('visible');
}

function renderExcerptBuilder(): void {
  let builder = $('excerptBuilder');
  
  if (!builder) {
    // Create builder element
    builder = document.createElement('div');
    builder.id = 'excerptBuilder';
    builder.className = 'excerpt-builder';
    builder.innerHTML = `
      <div class="excerpt-builder-content">
        <div class="excerpt-builder-header">
          <h3>Create Excerpt Link</h3>
          <button class="close-btn" onclick="closeExcerptBuilder()">×</button>
        </div>
        <div class="excerpt-preview"></div>
        <div class="excerpt-controls">
          <div class="control-group">
            <label>Start:</label>
            <button class="adj-btn" data-target="start" data-delta="-1">← word</button>
            <button class="adj-btn" data-target="start" data-delta="1">word →</button>
          </div>
          <div class="control-group">
            <label>End:</label>
            <button class="adj-btn" data-target="end" data-delta="-1">← word</button>
            <button class="adj-btn" data-target="end" data-delta="1">word →</button>
          </div>
        </div>
        <div class="excerpt-byte-info"></div>
        <div class="excerpt-actions">
          <button class="open-excerpt-btn">Open Excerpt ↗</button>
          <button class="copy-link-btn">Copy Link</button>
        </div>
        <div class="excerpt-link-display"></div>
      </div>
    `;
    document.body.appendChild(builder);
    
    // Attach control handlers
    builder.querySelectorAll('.adj-btn').forEach((btn: Element) => {
      btn.addEventListener('click', () => {
        const target = (btn as HTMLElement).dataset.target as 'start' | 'end';
        const delta = parseInt((btn as HTMLElement).dataset.delta || '0', 10);
        adjustExcerptByWord(target, delta);
      });
    });
    
    builder.querySelector('.open-excerpt-btn')?.addEventListener('click', openExcerptLink);
    builder.querySelector('.copy-link-btn')?.addEventListener('click', copyExcerptLink);
  }
  
  builder.classList.add('visible');
  updateExcerptPreview();
}

function adjustExcerptByWord(target: 'start' | 'end', delta: number): void {
  if (target === 'start') {
    const newIdx = excerptBuilder.startWordIdx + delta;
    if (newIdx >= 0 && newIdx <= excerptBuilder.endWordIdx) {
      excerptBuilder.startWordIdx = newIdx;
    }
  } else {
    const newIdx = excerptBuilder.endWordIdx + delta;
    if (newIdx >= excerptBuilder.startWordIdx && newIdx < excerptBuilder.words.length) {
      excerptBuilder.endWordIdx = newIdx;
    }
  }
  
  updateExcerptPreview();
}

function updateExcerptPreview(): void {
  const match = excerptBuilder.match;
  if (!match || excerptBuilder.words.length === 0) return;
  
  const preview = document.querySelector('.excerpt-preview');
  const byteInfo = document.querySelector('.excerpt-byte-info');
  const linkDisplay = document.querySelector('.excerpt-link-display');
  
  const startIdx = excerptBuilder.startWordIdx;
  const endIdx = excerptBuilder.endWordIdx;
  
  // Build selected text from words
  const selectedWords = excerptBuilder.words.slice(startIdx, endIdx + 1);
  const selectedText = selectedWords.map(w => w.word).join(' ');
  
  // Context words (up to 5 before and after)
  const beforeWords = excerptBuilder.words.slice(Math.max(0, startIdx - 5), startIdx);
  const afterWords = excerptBuilder.words.slice(endIdx + 1, Math.min(excerptBuilder.words.length, endIdx + 6));
  
  const beforeText = beforeWords.map(w => w.word).join(' ');
  const afterText = afterWords.map(w => w.word).join(' ');
  
  if (preview) {
    preview.innerHTML = `
      <span class="preview-context">${beforeText ? escapeHtml(beforeText) + ' ' : ''}</span><span class="preview-selected">${escapeHtml(selectedText)}</span><span class="preview-context">${afterText ? ' ' + escapeHtml(afterText) : ''}</span>
    `;
  }
  
  // Calculate byte positions from word boundaries
  const byteStart = selectedWords[0]?.byteStart ?? 0;
  const byteEnd = selectedWords[selectedWords.length - 1]?.byteEnd ?? 0;
  const chunkSize = byteEnd - byteStart;
  
  if (byteInfo) {
    byteInfo.innerHTML = `<small>Bytes ${byteStart.toLocaleString()}–${byteEnd.toLocaleString()} (${chunkSize} bytes, ${selectedWords.length} words)</small>`;
  }
  
  // Show link
  const link = buildExcerptLink(byteStart, chunkSize);
  if (linkDisplay) {
    linkDisplay.innerHTML = `<code>${escapeHtml(link)}</code>`;
  }
}

function buildExcerptLink(byteStart: number, chunkSize: number): string {
  const base = window.location.origin + '/read';
  const theme = localStorage.getItem('gutex-theme') || 'default';
  return `${base}?excerpt=1&theme=${theme}#${fulltextState.bookId},${byteStart},${chunkSize}`;
}

function openExcerptLink(): void {
  const startIdx = excerptBuilder.startWordIdx;
  const endIdx = excerptBuilder.endWordIdx;
  const selectedWords = excerptBuilder.words.slice(startIdx, endIdx + 1);
  
  if (selectedWords.length === 0) return;
  
  const byteStart = selectedWords[0].byteStart;
  const byteEnd = selectedWords[selectedWords.length - 1].byteEnd;
  const chunkSize = byteEnd - byteStart;
  
  const link = buildExcerptLink(byteStart, chunkSize);
  window.open(link, '_blank');
}

async function copyExcerptLink(): Promise<void> {
  const startIdx = excerptBuilder.startWordIdx;
  const endIdx = excerptBuilder.endWordIdx;
  const selectedWords = excerptBuilder.words.slice(startIdx, endIdx + 1);
  
  if (selectedWords.length === 0) return;
  
  const byteStart = selectedWords[0].byteStart;
  const byteEnd = selectedWords[selectedWords.length - 1].byteEnd;
  const chunkSize = byteEnd - byteStart;
  
  const link = buildExcerptLink(byteStart, chunkSize);
  
  try {
    await navigator.clipboard.writeText(link);
    const btn = document.querySelector('.copy-link-btn');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }
  } catch {
    prompt('Copy this link:', link);
  }
}

function jumpToBytePosition(bytePosition: number): void {
  closeFulltextSearch();
  const bookId = fulltextState.bookId;
  if (bookId) {
    window.location.hash = `${bookId},${bytePosition},500`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Debounced search
let fulltextSearchTimeout: number | null = null;

function debouncedFulltextSearch(): void {
  if (fulltextSearchTimeout) {
    clearTimeout(fulltextSearchTimeout);
  }
  fulltextSearchTimeout = window.setTimeout(performFulltextSearch, 300);
}
