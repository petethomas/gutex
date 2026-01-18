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

// Excerpt builder state - tracks actual byte positions
const excerptBuilder = {
  visible: false,
  match: null as NetworkSearchMatch | null,
  // The expanded text we fetched for adjustment
  expandedText: '',
  expandedByteStart: 0,
  // Current selection within expanded text (character indices)
  selStart: 0,
  selEnd: 0
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
  
  // Fetch expanded context (±300 bytes from match to allow adjustment)
  const expandStart = Math.max(0, match.byteStart - 300);
  const expandSize = match.matchedText.length + 600;
  
  try {
    const response = await fetch(
      `/api/book/${fulltextState.bookId}/chunk?byteStart=${expandStart}&chunkSize=${expandSize}`
    );
    const data = await response.json();
    excerptBuilder.expandedText = data.words?.join(' ') || match.context;
    excerptBuilder.expandedByteStart = data.byteStart ?? expandStart;
  } catch {
    // Fall back to original context
    excerptBuilder.expandedText = match.context;
    excerptBuilder.expandedByteStart = match.byteStart - 50;
  }
  
  // Initialize selection to the match position within expanded text
  const matchOffsetInExpanded = match.byteStart - excerptBuilder.expandedByteStart;
  excerptBuilder.selStart = Math.max(0, matchOffsetInExpanded);
  excerptBuilder.selEnd = Math.min(
    excerptBuilder.expandedText.length,
    matchOffsetInExpanded + match.matchedText.length
  );
  
  renderExcerptBuilder();
}

function closeExcerptBuilder(): void {
  excerptBuilder.visible = false;
  excerptBuilder.match = null;
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
            <button class="adj-btn" data-target="start" data-delta="-1">−word</button>
            <button class="adj-btn" data-target="start" data-delta="1">+word</button>
          </div>
          <div class="control-group">
            <label>End:</label>
            <button class="adj-btn" data-target="end" data-delta="-1">−word</button>
            <button class="adj-btn" data-target="end" data-delta="1">+word</button>
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
  const text = excerptBuilder.expandedText;
  
  if (target === 'start') {
    if (delta < 0) {
      // Move start backward (include previous word)
      let pos = excerptBuilder.selStart - 1;
      // Skip whitespace
      while (pos > 0 && /\s/.test(text[pos])) pos--;
      // Find start of previous word
      while (pos > 0 && !/\s/.test(text[pos - 1])) pos--;
      excerptBuilder.selStart = Math.max(0, pos);
    } else {
      // Move start forward (exclude first word)
      let pos = excerptBuilder.selStart;
      // Skip current word
      while (pos < excerptBuilder.selEnd && !/\s/.test(text[pos])) pos++;
      // Skip whitespace
      while (pos < excerptBuilder.selEnd && /\s/.test(text[pos])) pos++;
      if (pos < excerptBuilder.selEnd) {
        excerptBuilder.selStart = pos;
      }
    }
  } else {
    if (delta > 0) {
      // Move end forward (include next word)
      let pos = excerptBuilder.selEnd;
      // Skip whitespace
      while (pos < text.length && /\s/.test(text[pos])) pos++;
      // Find end of next word
      while (pos < text.length && !/\s/.test(text[pos])) pos++;
      excerptBuilder.selEnd = Math.min(text.length, pos);
    } else {
      // Move end backward (exclude last word)
      let pos = excerptBuilder.selEnd - 1;
      // Skip whitespace from end
      while (pos > excerptBuilder.selStart && /\s/.test(text[pos])) pos--;
      // Find start of last word
      while (pos > excerptBuilder.selStart && !/\s/.test(text[pos - 1])) pos--;
      if (pos > excerptBuilder.selStart) {
        excerptBuilder.selEnd = pos;
      }
    }
  }
  
  updateExcerptPreview();
}

function updateExcerptPreview(): void {
  const match = excerptBuilder.match;
  if (!match) return;
  
  const preview = document.querySelector('.excerpt-preview');
  const byteInfo = document.querySelector('.excerpt-byte-info');
  const linkDisplay = document.querySelector('.excerpt-link-display');
  
  const text = excerptBuilder.expandedText;
  const selStart = excerptBuilder.selStart;
  const selEnd = excerptBuilder.selEnd;
  
  // Selected text
  const selectedText = text.slice(selStart, selEnd);
  // Context around selection (for display only)
  const beforeText = text.slice(Math.max(0, selStart - 40), selStart);
  const afterText = text.slice(selEnd, Math.min(text.length, selEnd + 40));
  
  if (preview) {
    preview.innerHTML = `
      <span class="preview-context">${escapeHtml(beforeText)}</span><span class="preview-selected">${escapeHtml(selectedText)}</span><span class="preview-context">${escapeHtml(afterText)}</span>
    `;
  }
  
  // Calculate actual byte positions
  const actualByteStart = excerptBuilder.expandedByteStart + selStart;
  const actualByteEnd = excerptBuilder.expandedByteStart + selEnd;
  const chunkSize = actualByteEnd - actualByteStart;
  
  if (byteInfo) {
    byteInfo.innerHTML = `<small>Bytes ${actualByteStart.toLocaleString()}–${actualByteEnd.toLocaleString()} (${chunkSize} bytes)</small>`;
  }
  
  // Show link
  const link = buildExcerptLink(actualByteStart, chunkSize);
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
  const actualByteStart = excerptBuilder.expandedByteStart + excerptBuilder.selStart;
  const chunkSize = excerptBuilder.selEnd - excerptBuilder.selStart;
  
  const link = buildExcerptLink(actualByteStart, chunkSize);
  window.open(link, '_blank');
}

async function copyExcerptLink(): Promise<void> {
  const actualByteStart = excerptBuilder.expandedByteStart + excerptBuilder.selStart;
  const chunkSize = excerptBuilder.selEnd - excerptBuilder.selStart;
  
  const link = buildExcerptLink(actualByteStart, chunkSize);
  
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
