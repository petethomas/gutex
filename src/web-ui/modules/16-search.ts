// @ts-nocheck
// ========== Search modal ==========
const searchState = { results: [], selectedIndex: -1 };
const SEARCH_CACHE_KEY = 'gutex_last_search';

function saveSearchCache(query, results) {
  try { storage.setItem(SEARCH_CACHE_KEY, JSON.stringify({ query, results })); } catch (e) {}
}

function loadSearchCache() {
  try {
    const cached = storage.getItem(SEARCH_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (e) { return null; }
}

function renderSearchResults(results, query) {
  searchState.results = results;
  $('searchStatus').textContent = `${results.length} result${results.length > 1 ? 's' : ''} — ↑↓ Enter`;

  $('searchResultsList').innerHTML = results.map((book, idx) => {
    const author = book.author
      ? book.author.replace(/,\s*\d{4}-\d{4}/g, '').replace(/,\s*\d{4}-/g, '').replace(/,\s*-\d{4}/g, '').replace(/\s*\[.*?\]/g, '').split('; ').map(name => name.split(', ').reverse().join(' ').trim()).join(', ')
      : null;
    return `
      <li data-idx="${idx}" data-id="${book.id}">
        <span class="book-id">#${book.id}</span>
        <span class="book-title">${escapeHtml(book.title)}</span>
        <div class="book-meta">${author ? `<span class="book-author">${escapeHtml(author)}</span>` : ''}</div>
      </li>
    `;
  }).join('');

  $('searchResultsList').querySelectorAll('li').forEach(li => {
    const idx = parseInt(li.dataset.idx, 10);
    const book = searchState.results[idx];
    li.addEventListener('click', () => navigateToResult(li.dataset.id, book?.title, book?.author));
  });
}

function openSearch() {
  $('searchOverlay').classList.add('visible');
  searchState.selectedIndex = -1;

  const cached = loadSearchCache();
  if (cached && cached.results?.length > 0) {
    $('searchQuery').value = cached.query || '';
    renderSearchResults(cached.results, cached.query);
  } else {
    $('searchQuery').value = '';
    $('searchStatus').textContent = '';
    $('searchResultsList').innerHTML = '';
    searchState.results = [];
  }

  $('searchQuery').focus();
  $('searchQuery').select();
}

function closeSearch() {
  $('searchOverlay').classList.remove('visible');
  $('mainContent').focus();
}

function updateSearchSelection() {
  const items = $('searchResultsList').querySelectorAll('li');
  items.forEach((item, i) => item.classList.toggle('selected', i === searchState.selectedIndex));
  if (searchState.selectedIndex >= 0 && items[searchState.selectedIndex]) {
    items[searchState.selectedIndex].scrollIntoView({ block: 'nearest' });
  }
}

async function navigateToResult(bookId, title, author) {
  closeSearch();
  searchInitiatedLoad = true; // Flag for error handling in initBook
  
  // Set pending book info for interstitial modal
  if (title) {
    const formattedAuthor = author
      ? author.replace(/,\s*\d{4}-\d{4}/g, '').replace(/,\s*\d{4}-/g, '').replace(/,\s*-\d{4}/g, '').replace(/\s*\[.*?\]/g, '').split('; ').map(name => name.split(', ').reverse().join(' ').trim()).join(', ')
      : '';
    pendingBookInfo = { bookId: parseInt(bookId, 10), title, author: formattedAuthor };
  }
  
  // If in 3D mode and auto-read is active, keep animation going during load
  // Don't clear words or reset momentum - we'll do a smooth transition
  const wasAutoReading = autoRead.active;
  const hadMomentum = rope3d.active && rope3d.momentum !== 0;
  
  // Set loading state but keep current content visible
  if (rope3d.active) {
    state.loading = true;
    // Don't clear words - keep displaying current content
    // Don't reset momentum - keep scrolling
    $('titleBarTitle').textContent = 'Loading...';
    $('titleBarAuthor').textContent = '';
  }
  
  const data = await initBook(parseInt(bookId, 10), null, state.chunkSize, true);
  
  // Only update URL if content loaded successfully
  if (data) {
    const newHash = buildHash(bookId, data.byteStart, state.chunkSize, rope3d.active);
    window.history.replaceState(null, '', newHash);
  }
  
  // Reset rope3d state if active and load succeeded
  if (rope3d.active && data) {
    const newText = data.formattedText || data.words.join(' ');
    const words = tokenizeForRope(newText);
    setRopeWords(words);
    rope3d.wordOffset = 0;
    // Preserve momentum if auto-read was active for smooth transition
    if (!wasAutoReading && !hadMomentum) {
      rope3d.momentum = 0;
    }
    rope3d.firstByteStart = data.byteStart;
    rope3d.lastByteEnd = data.byteEnd;
    rope3d.viewBytePosition = data.byteStart;
    rope3d.backwardHistory = [];
    rope3d.justToggledFrames = 60; // Prevent immediate re-teleport
    
    if (rope3d.allWords.length > 0 && data.byteEnd > data.byteStart) {
      rope3d.bytesPerWord = (data.byteEnd - data.byteStart) / rope3d.allWords.length;
    }
    
    state.loading = false;
  }
}

async function performSearch(query) {
  if (!query || query.length < 2) {
    $('searchStatus').textContent = 'Enter at least 2 characters';
    $('searchResultsList').innerHTML = '';
    searchState.results = [];
    searchState.selectedIndex = -1;
    return;
  }

  $('searchStatus').textContent = 'Searching...';
  $('searchResultsList').innerHTML = '';
  searchState.results = [];
  searchState.selectedIndex = -1;

  try {
    const lang = $('searchLanguage').value;
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(lang)}`);
    const data = await res.json();

    if (data.error) { $('searchStatus').textContent = data.error; return; }
    if (data.results.length === 0) { $('searchStatus').textContent = `No results for "${query}"`; return; }

    renderSearchResults(data.results, query);
    saveSearchCache(query, data.results);
  } catch (err) {
    $('searchStatus').textContent = `Error: ${err.message}`;
  }
}

// Search language selector - save preference and re-search
$('searchLanguage').addEventListener('change', (e) => {
  localStorage.setItem('gutex-language', e.target.value);
  
  // Re-search if there's a query
  const query = $('searchQuery').value;
  if (query && query.length >= 2) {
    performSearch(query);
  }
});

$('searchToggle').addEventListener('click', openSearch);

// Home button - show confirmation modal
function openHomeConfirm() {
  $('homeConfirmOverlay').classList.add('visible');
  $('homeConfirmPanel').focus();
}
function closeHomeConfirm() {
  $('homeConfirmOverlay').classList.remove('visible');
  refocusAfterButton();
}
$('homeBtn').addEventListener('click', openHomeConfirm);
$('homeConfirmClose').addEventListener('click', closeHomeConfirm);
$('homeConfirmCancel').addEventListener('click', closeHomeConfirm);
$('homeConfirmOk').addEventListener('click', () => {
  window.location.href = '/';
});
$('homeConfirmOverlay').addEventListener('click', (e) => {
  if (e.target === $('homeConfirmOverlay')) closeHomeConfirm();
});
$('homeConfirmPanel').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeHomeConfirm();
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    window.location.href = '/';
  }
});

$('searchClose').addEventListener('click', closeSearch);
$('searchOverlay').addEventListener('click', (e) => { if (e.target === $('searchOverlay')) closeSearch(); });

let searchTimeout;
$('searchQuery').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchState.selectedIndex = -1;
  const query = $('searchQuery').value;
  if (query.length >= 2) {
    searchTimeout = setTimeout(() => performSearch(query), 300);
  } else {
    $('searchStatus').textContent = '';
    $('searchResultsList').innerHTML = '';
    searchState.results = [];
  }
});

$('searchQuery').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSearch(); return; }
  if (e.key === 'Enter') {
    if (searchState.selectedIndex >= 0 && searchState.results[searchState.selectedIndex]) {
      const book = searchState.results[searchState.selectedIndex];
      navigateToResult(book.id, book.title, book.author);
    } else {
      performSearch($('searchQuery').value);
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (searchState.results.length > 0) {
      searchState.selectedIndex = Math.min(searchState.selectedIndex + 1, searchState.results.length - 1);
      updateSearchSelection();
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (searchState.results.length > 0) {
      searchState.selectedIndex = Math.max(searchState.selectedIndex - 1, -1);
      updateSearchSelection();
    }
    return;
  }
});
