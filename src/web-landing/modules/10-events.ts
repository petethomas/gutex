// @ts-nocheck
// ========== Event handlers ==========

// Language initialization
function initLanguage(): void {
  const savedLang = localStorage.getItem('gutex-language') || 'en';
  const langSelect = $('langSelect') as HTMLSelectElement | null;
  if (langSelect) langSelect.value = savedLang;
}

// Main event setup
document.addEventListener('DOMContentLoaded', () => {
  initLanguage();
  
  // Handle language changes
  const langSelect = $('langSelect') as HTMLSelectElement | null;
  if (langSelect) {
    langSelect.addEventListener('change', function() {
      localStorage.setItem('gutex-language', this.value);
      const query = ($('query') as HTMLInputElement | null)?.value.trim() || '';
      if (query.length >= 2) {
        search(query);
      }
    });
  }
});

// Search button click
const searchBtn = $('searchBtn');
if (searchBtn) {
  searchBtn.addEventListener('click', () => {
    setTyping(false);
    const query = ($('query') as HTMLInputElement | null)?.value || '';
    search(query);
  });
}

// Query input events
const queryInput = $('query') as HTMLInputElement | null;
if (queryInput) {
  queryInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      setTyping(false);
      if (selectedIndex >= 0 && currentResults[selectedIndex]) {
        window.location.href = '/read#' + currentResults[selectedIndex].id;
      } else {
        search(queryInput.value);
      }
      return;
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
        updateSelection();
      }
      return;
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelection();
      }
      return;
    }
  });
  
  let searchTimeout: number | null = null;
  queryInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    selectedIndex = -1;
    const query = queryInput.value;
    
    setTyping(true);
    
    if (query.length >= 2) {
      searchTimeout = window.setTimeout(() => {
        setTyping(false);
        search(query);
      }, 300);
    } else {
      const status = $('status');
      const results = $('results');
      if (status) status.textContent = '';
      if (results) results.innerHTML = '';
      currentResults = [];
      broadcastState();
    }
  });
}

// P2P event listeners
const p2pToggle = $('p2pToggle');
if (p2pToggle) p2pToggle.addEventListener('click', toggleP2PPanel);

const p2pClose = $('p2pClose');
if (p2pClose) p2pClose.addEventListener('click', () => {
  const panel = $('p2pPanel');
  if (panel) panel.classList.remove('visible');
});

const p2pCreateBtn = $('p2pCreateBtn');
if (p2pCreateBtn) p2pCreateBtn.addEventListener('click', createRoom);

const p2pJoinBtn = $('p2pJoinBtn');
if (p2pJoinBtn) p2pJoinBtn.addEventListener('click', () => {
  const input = $('p2pRoomCodeInput') as HTMLInputElement | null;
  if (input) joinRoom(input.value);
});

const p2pRoomCodeInput = $('p2pRoomCodeInput') as HTMLInputElement | null;
if (p2pRoomCodeInput) {
  p2pRoomCodeInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') joinRoom(p2pRoomCodeInput.value);
  });
}

// Banner buttons
const bannerCopyBtn = $('bannerCopyBtn');
if (bannerCopyBtn) bannerCopyBtn.addEventListener('click', copyRoomCode);

const bannerLeaveBtn = $('bannerLeaveBtn');
if (bannerLeaveBtn) bannerLeaveBtn.addEventListener('click', leaveRoom);

// Fulltext search events
const fulltextClose = $('fulltextClose');
if (fulltextClose) fulltextClose.addEventListener('click', closeFulltextSearch);

const fulltextOverlay = $('fulltextOverlay');
if (fulltextOverlay) {
  fulltextOverlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === fulltextOverlay) closeFulltextSearch();
  });
}

const fulltextQuery = $('fulltextQuery') as HTMLInputElement | null;
if (fulltextQuery) {
  fulltextQuery.addEventListener('input', debouncedFulltextSearch);
  fulltextQuery.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeFulltextSearch();
  });
}

const fulltextCaseSensitive = $('fulltextCaseSensitive');
if (fulltextCaseSensitive) fulltextCaseSensitive.addEventListener('change', debouncedFulltextSearch);

const fulltextWholeWords = $('fulltextWholeWords');
if (fulltextWholeWords) fulltextWholeWords.addEventListener('change', debouncedFulltextSearch);

const fulltextRegex = $('fulltextRegex');
if (fulltextRegex) fulltextRegex.addEventListener('change', debouncedFulltextSearch);

// Context view events
const contextClose = $('contextClose');
if (contextClose) contextClose.addEventListener('click', closeContextView);

const contextOverlay = $('contextOverlay');
if (contextOverlay) {
  contextOverlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === contextOverlay) closeContextView();
  });
}

const contextWordsInput = $('contextWordsInput') as HTMLInputElement | null;
if (contextWordsInput) {
  contextWordsInput.addEventListener('change', updateContextView);
  contextWordsInput.addEventListener('input', updateContextView);
}

const contextExactMatch = $('contextExactMatch');
if (contextExactMatch) contextExactMatch.addEventListener('change', updateContextView);

const contextExcerptBtn = $('contextExcerptBtn');
if (contextExcerptBtn) contextExcerptBtn.addEventListener('click', openExcerptFromContext);

const contextReadHere = $('contextReadHere');
if (contextReadHere) contextReadHere.addEventListener('click', readFromContext);

// Keyboard shortcut for closing modals
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    const contextOverlay = $('contextOverlay');
    const fulltextOverlay = $('fulltextOverlay');
    
    if (contextOverlay?.classList.contains('visible')) {
      closeContextView();
    } else if (fulltextOverlay?.classList.contains('visible')) {
      closeFulltextSearch();
    }
  }
});
