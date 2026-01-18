// @ts-nocheck
// ========== Catalog search functionality ==========
function saveSearchCache(query: string, results: SearchResult[]): void {
  try {
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify({ query, results }));
  } catch (e) {}
}

function loadSearchCache(): { query: string; results: SearchResult[] } | null {
  try {
    const cached = localStorage.getItem(SEARCH_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function renderResults(results: SearchResult[], query: string): void {
  currentResults = results;
  const status = $('status');
  if (status) {
    status.textContent = results.length + ' result' + (results.length !== 1 ? 's' : '') + ' for "' + query + '" — ↑↓ to navigate, Enter to select';
  }
  
  const resultsEl = $('results');
  if (!resultsEl) return;
  
  resultsEl.innerHTML = results.map((book: SearchResult) => {
    const author = book.author ? formatAuthor(book.author) : null;
    return '<li>' +
      '<div class="result-content">' +
        '<a href="/read#' + book.id + '">' +
          '<span class="book-id">#' + book.id + '</span>' +
          '<span class="book-title">' + escapeHtml(book.title) + '</span>' +
          (author ? '<span class="book-author"> — ' + escapeHtml(author) + '</span>' : '') +
        '</a>' +
      '</div>' +
      '<button class="search-inside-btn" data-book-id="' + book.id + '" data-book-title="' + escapeHtml(book.title) + '" data-book-author="' + escapeHtml(author || '') + '" title="Search inside the book">🔎</button>' +
    '</li>';
  }).join('');
  
  // Attach click handlers for search inside buttons
  resultsEl.querySelectorAll('.search-inside-btn').forEach((btn: Element) => {
    btn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      const bookId = parseInt(target.dataset.bookId || '', 10);
      const bookTitle = target.dataset.bookTitle || '';
      const bookAuthor = target.dataset.bookAuthor || '';
      openFulltextSearch(bookId, bookTitle, bookAuthor);
    });
  });
  
  broadcastState();
}

function updateSelection(): void {
  const resultsEl = $('results');
  if (!resultsEl) return;
  
  const items = resultsEl.querySelectorAll('li');
  items.forEach((item: Element, i: number) => {
    item.classList.toggle('selected', i === selectedIndex);
  });
  
  if (selectedIndex >= 0 && items[selectedIndex]) {
    items[selectedIndex].scrollIntoView({ block: 'nearest' });
  }
}

async function search(query: string): Promise<void> {
  const status = $('status');
  const resultsEl = $('results');
  
  if (!query || query.length < 2) {
    if (status) status.textContent = 'Enter at least 2 characters';
    if (resultsEl) resultsEl.innerHTML = '';
    currentResults = [];
    selectedIndex = -1;
    broadcastState();
    return;
  }
  
  if (status) status.textContent = 'Searching...';
  if (resultsEl) resultsEl.innerHTML = '';
  currentResults = [];
  selectedIndex = -1;
  
  try {
    const langSelect = $('langSelect') as HTMLSelectElement | null;
    const lang = langSelect ? langSelect.value : (localStorage.getItem('gutex-language') || 'en');
    const res = await fetch('/api/search?q=' + encodeURIComponent(query) + '&lang=' + encodeURIComponent(lang));
    const data = await res.json();
    
    if (data.error) {
      if (status) status.textContent = data.error;
      broadcastState();
      return;
    }
    
    if (data.results.length === 0) {
      if (status) status.textContent = 'No results for "' + query + '"';
      broadcastState();
      return;
    }
    
    renderResults(data.results, query);
    saveSearchCache(query, data.results);
    
  } catch (err) {
    if (status) status.textContent = 'Error: ' + (err as Error).message;
    broadcastState();
  }
}
