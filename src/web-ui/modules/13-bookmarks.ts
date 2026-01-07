// @ts-nocheck
// ========== Bookmarks ==========
const BOOKMARKS_KEY = 'gutex_bookmarks';

// Navigation history (in-memory, per session)
const navHistory = [];
const MAX_NAV_HISTORY = 100;

function recordNavigation() {
  if (!state.bookId) return;
  navHistory.unshift({
    timestamp: Date.now(),
    bookId: state.bookId,
    byteStart: state.byteStart,
    chunkSize: state.chunkSize,
    title: state.bookTitle || `Book ${state.bookId}`,
    percent: $('percent').textContent
  });
  if (navHistory.length > MAX_NAV_HISTORY) navHistory.pop();
}

// Storage abstraction with fallbacks: localStorage -> sessionStorage -> memory
const storage = (function() {
  let memoryStore = {};
  let activeStore = 'memory';
  
  function testStorage(store) {
    try {
      const test = '__storage_test__';
      store.setItem(test, test);
      store.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  // Try localStorage first, then sessionStorage, then memory
  // Wrap in try-catch because even accessing these can throw in strict contexts
  try {
    if (testStorage(window.localStorage)) {
      activeStore = 'localStorage';
    }
  } catch (e) {}
  
  if (activeStore === 'memory') {
    try {
      if (testStorage(window.sessionStorage)) {
        activeStore = 'sessionStorage';
      }
    } catch (e) {}
  }
  
  return {
    getItem: function(key) {
      try {
        if (activeStore === 'localStorage') return window.localStorage.getItem(key);
        if (activeStore === 'sessionStorage') return window.sessionStorage.getItem(key);
      } catch (e) {}
      return memoryStore[key] || null;
    },
    setItem: function(key, value) {
      try {
        if (activeStore === 'localStorage') { window.localStorage.setItem(key, value); return; }
        if (activeStore === 'sessionStorage') { window.sessionStorage.setItem(key, value); return; }
      } catch (e) {}
      memoryStore[key] = value;
    },
    removeItem: function(key) {
      try {
        if (activeStore === 'localStorage') { window.localStorage.removeItem(key); return; }
        if (activeStore === 'sessionStorage') { window.sessionStorage.removeItem(key); return; }
      } catch (e) {}
      delete memoryStore[key];
    },
    type: activeStore
  };
})();

// Bookmark cache for synchronous access (loaded from browser storage)
let bookmarksCache = {};

function loadBookmarksFromStorage() {
  try {
    const stored = storage.getItem(BOOKMARKS_KEY);
    if (stored) {
      bookmarksCache = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load bookmarks from storage:', e);
    bookmarksCache = {};
  }
  return bookmarksCache;
}

function loadBookmarks() {
  // Return cached bookmarks for synchronous access
  // Call loadBookmarksFromStorage() to refresh from storage
  return bookmarksCache;
}

function saveBookmarkToStorage(name, info) {
  try {
    bookmarksCache[name] = info;
    storage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarksCache));
  } catch (e) {
    console.error('Failed to save bookmark:', e);
  }
}

function deleteBookmarkFromStorage(name) {
  try {
    delete bookmarksCache[name];
    storage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarksCache));
  } catch (e) {
    console.error('Failed to delete bookmark:', e);
  }
}

function renderBookmarkList() {
  const list = $('bookmarkList');
  
  loadBookmarksFromStorage();
  const bookmarks = loadBookmarks();
  const entries = Object.entries(bookmarks);

  if (entries.length === 0) {
    list.innerHTML = '<div class="empty">No bookmarks yet</div>';
    return;
  }

  // Sort by timestamp descending (most recent first)
  entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

  list.innerHTML = entries.map(([name, info], idx) => {
    const displayName = escapeHtml(name);
    const meta = `Book ${info.bookId} · ${info.percent}%`;
    const title = info.bookTitle ? escapeHtml(info.bookTitle.substring(0, 40)) : '';
    const isCurrent = info.bookId === state.bookId && 
                      info.byteStart === state.byteStart && 
                      info.chunkSize === state.chunkSize;
    const currentClass = isCurrent ? ' bookmark-item-current' : '';
    return `
      <div class="bookmark-item${currentClass}" data-idx="${idx}">
        <div class="bookmark-item-info" data-idx="${idx}">
          <div class="bookmark-item-name">${displayName}${isCurrent ? ' <span class="current-tag">(here)</span>' : ''}</div>
          <div class="bookmark-item-meta">${meta}${title ? ' · ' + title : ''}</div>
        </div>
        <button class="bookmark-item-delete" data-idx="${idx}" title="Delete">✕</button>
      </div>
    `;
  }).join('');

  // Store entries for lookup by index
  list._entries = entries;

  // Add click/touch handlers (improved mobile support)
  list.querySelectorAll('.bookmark-item-info').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    const info = entries[idx][1];
    const isCurrent = info.bookId === state.bookId && 
                      info.byteStart === state.byteStart && 
                      info.chunkSize === state.chunkSize;
    if (!isCurrent) {
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = list._entries[idx][0];
        goToBookmark(name);
      };
      el.addEventListener('click', handler);
      // Add touch support for mobile
      el.addEventListener('touchend', (e) => {
        // Only trigger if it's a tap (not a scroll)
        if (e.cancelable) {
          handler(e);
        }
      }, { passive: false });
    }
  });

  list.querySelectorAll('.bookmark-item-delete').forEach(el => {
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(el.dataset.idx, 10);
      const name = list._entries[idx][0];
      deleteBookmark(name);
    };
    el.addEventListener('click', handler);
    el.addEventListener('touchend', (e) => {
      if (e.cancelable) {
        handler(e);
      }
    }, { passive: false });
  });
}

function saveCurrentBookmark() {
  if (!state.bookId) return;

  let name = $('bookmarkName').value.trim();
  
  // Generate default name if empty
  if (!name) {
    const shortTitle = (state.bookTitle || `Book ${state.bookId}`).substring(0, 20);
    const percent = state.byteStart && state.docEnd 
      ? Math.round(((state.byteStart - state.docStart) / (state.docEnd - state.docStart)) * 100)
      : 0;
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    name = `${shortTitle} @ ${percent}% — ${timeStr}`;
  }

  const info = {
    bookId: state.bookId,
    byteStart: state.byteStart,
    chunkSize: state.chunkSize,
    bookTitle: state.bookTitle,
    bookAuthor: state.bookAuthor,
    percent: state.byteStart && state.docEnd 
      ? Math.round(((state.byteStart - state.docStart) / (state.docEnd - state.docStart)) * 100)
      : 0,
    timestamp: Date.now(),
    mode: rope3d.active ? '3d' : '2d'
  };

  saveBookmarkToStorage(name, info);
  $('bookmarkName').value = '';
  renderBookmarkList();
  showHint(`Saved bookmark: ${name}`, 1500);
}

function goToBookmark(name) {
  const bookmarks = loadBookmarks();
  const info = bookmarks[name];
  if (!info) return;

  closeBookmarkModal();
  
  // Set pending book info for interstitial modal
  if (info.bookTitle) {
    pendingBookInfo = { bookId: info.bookId, title: info.bookTitle, author: info.bookAuthor || '' };
  }
  
  // Determine target mode (default to 2d for old bookmarks)
  const targetMode = info.mode || '2d';
  const needsModeSwitch = (targetMode === '3d') !== rope3d.active;
  
  // Switch mode if needed (before loading content)
  if (needsModeSwitch) {
    toggleRopeMode();
  }
  
  // In 3D mode, directly load rather than relying on hashchange
  if (rope3d.active) {
    // Fade out canvas
    fadeCanvas(0.3, 100);
    
    // Preserve auto-read state - don't stop in 3D mode, let the content load smoothly
    const wasAutoActive = autoRead.active;
    initBook(info.bookId, info.byteStart, info.chunkSize).then(data => {
      if (data) {
        // Sync 3D rope with new data
        const newText = data.formattedText || data.words.join(' ');
        const words = tokenizeForRope(newText);
        setRopeWords(words);
        rope3d.wordOffset = 0;
        rope3d.momentum = 0;
        rope3d.firstByteStart = data.byteStart;
        rope3d.lastByteEnd = data.byteEnd;
        rope3d.viewBytePosition = data.byteStart;
        rope3d.backwardHistory = [];
        rope3d.justToggledFrames = 60; // Prevent immediate re-teleport
        
        if (rope3d.allWords.length > 0 && data.byteEnd > data.byteStart) {
          rope3d.bytesPerWord = (data.byteEnd - data.byteStart) / rope3d.allWords.length;
        }
      } else {
        syncRopeFromContent();
      }
      
      // Fade back in
      fadeCanvas(1, 100);
    });
    
    // Update hash without triggering hashchange
    const newHash = buildHash(info.bookId, info.byteStart, info.chunkSize, true);
    window.history.replaceState(null, '', newHash);
  } else {
    // 2D mode - use hash navigation
    const newHash = buildHash(info.bookId, info.byteStart, info.chunkSize, false);
    window.location.hash = newHash;
  }
}

function deleteBookmark(name) {
  deleteBookmarkFromStorage(name);
  renderBookmarkList();
}

function openBookmarkModal() {
  renderBookmarkList();
  renderHistoryList();
  $('bookmarkOverlay').classList.add('visible');
  $('bookmarkPanel').focus();
  $('bookmarkName').focus();
}

function closeBookmarkModal() {
  $('bookmarkOverlay').classList.remove('visible');
  refocusAfterButton();
}

// Tab switching
function switchBookmarkTab(tabName) {
  document.querySelectorAll('.bookmark-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  $('bookmarkList').style.display = tabName === 'bookmarks' ? 'block' : 'none';
  $('historyList').style.display = tabName === 'history' ? 'block' : 'none';
  $('bookmarkActions').style.display = tabName === 'bookmarks' ? 'flex' : 'none';
}

function renderHistoryList() {
  const list = $('historyList');
  if (navHistory.length === 0) {
    list.innerHTML = '<div class="empty">No history yet</div>';
    return;
  }
  list.innerHTML = navHistory.map((h, idx) => {
    const d = new Date(h.timestamp);
    const time = d.toLocaleTimeString();
    const date = d.toLocaleDateString();
    return `
      <div class="history-item" data-idx="${idx}">
        <div class="history-item-time">${date} ${time}</div>
        <div class="history-item-title">${escapeHtml(h.title)}</div>
        <div class="history-item-meta">Book #${h.bookId} · ${h.percent} · ${h.chunkSize}w</div>
      </div>
    `;
  }).join('');
  
  list.querySelectorAll('.history-item').forEach(el => {
    const handler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const h = navHistory[parseInt(el.dataset.idx, 10)];
      if (!h) return;
      closeBookmarkModal();
      // Set pending book info for interstitial modal
      pendingBookInfo = { bookId: h.bookId, title: h.title, author: '' };
      await initBook(h.bookId, h.byteStart, h.chunkSize, true);
    };
    el.addEventListener('click', handler);
    // Add touch support for mobile
    el.addEventListener('touchend', (e) => {
      if (e.cancelable) {
        handler(e);
      }
    }, { passive: false });
  });
}

document.querySelectorAll('.bookmark-tab').forEach(tab => {
  tab.addEventListener('click', () => switchBookmarkTab(tab.dataset.tab));
});

$('bookmarkBtn').addEventListener('click', (e) => {
  e.preventDefault();
  openBookmarkModal();
});
// Touch support for mobile
$('bookmarkBtn').addEventListener('touchend', (e) => {
  e.preventDefault();
  e.stopPropagation();
  openBookmarkModal();
}, { passive: false });

$('bookmarkClose').addEventListener('click', closeBookmarkModal);
$('bookmarkSaveBtn').addEventListener('click', saveCurrentBookmark);
$('bookmarkOverlay').addEventListener('click', (e) => {
  if (e.target === $('bookmarkOverlay')) closeBookmarkModal();
});
$('bookmarkPanel').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeBookmarkModal();
  }
  if (e.key === 'Enter' && e.target === $('bookmarkName')) {
    e.preventDefault();
    saveCurrentBookmark();
  }
});

// End of book modal event listeners
$('endOfBookYes').addEventListener('click', () => {
  hideEndOfBookModal();
  teleportToRandomLocation();
});
$('endOfBookNo').addEventListener('click', () => {
  hideEndOfBookModal();
});
$('endOfBookOverlay').addEventListener('click', (e) => {
  if (e.target === $('endOfBookOverlay')) hideEndOfBookModal();
});
$('endOfBookOverlay').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    hideEndOfBookModal();
  }
});
