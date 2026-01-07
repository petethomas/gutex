// @ts-nocheck
// ========== Fetch and navigate ==========
async function fetchChunk(bookId, byteStart, chunkSize) {
  const params = new URLSearchParams();
  if (chunkSize) params.set('chunkSize', chunkSize);

  let url;
  if (byteStart !== null && byteStart !== undefined && !isNaN(byteStart)) {
    params.set('byteStart', byteStart);
    url = `/api/book/${bookId}/chunk?${params}`;
  } else {
    url = `/api/book/${bookId}/init?${params}`;
  }

  const startTime = performance.now();
  const res = await fetch(url);
  const duration = performance.now() - startTime;

  latencyTracker.record(duration);
  state.lastFetchDuration = duration;

  // Adjust interval options based on latency
  adjustIntervalOptions();

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return data;
}

// Track if the current load was initiated from search (for error handling)
let searchInitiatedLoad = false;

// Track pending book info for interstitial modal
let pendingBookInfo = null;

async function initBook(bookId, byteStart = null, chunkSize = 200, clearHistory = true, updateHash = true) {
  state.loading = true;
  updateButtonStates();
  $('content').className = 'loading';
  $('content').textContent = `Loading book ${bookId}...`;

  if (clearHistory) {
    navHistoryStack.length = 0;
  }

  const isBookChange = bookId !== state.bookId;
  
  if (isBookChange) {
    // Show interstitial modal for book change
    if (pendingBookInfo && pendingBookInfo.bookId === bookId) {
      // Use provided info (from search, bookmark, etc)
      showBookChangeModal(pendingBookInfo.title, pendingBookInfo.author, false);
    } else {
      // No info yet - show loading (fetchBookInfo will update)
      showBookChangeModal(null, null, false);
    }
    pendingBookInfo = null;
    
    state.bookTitle = null;
    state.bookAuthor = null;
    $('titleBarTitle').textContent = `Book ${bookId}`;
    $('titleBarAuthor').textContent = '';
    fetchBookInfo(bookId);
  }

  try {
    const data = await fetchChunk(bookId, byteStart, chunkSize);
    updateUI(data);
    searchInitiatedLoad = false; // Clear flag on success
    
    // Update URL after data is loaded (prevents URL/content mismatch)
    if (updateHash) {
      const newHash = buildHash(data.bookId, data.byteStart, state.chunkSize, rope3d.active);
      window.history.replaceState(null, '', newHash);
    }
    
    // Auto-hide modal after successful load, re-enable buttons when modal hides
    if (isBookChange) {
      setTimeout(() => {
        hideBookChangeModal();
        state.loading = false;
        updateButtonStates();
      }, 500);
    } else {
      state.loading = false;
      updateButtonStates();
    }
    
    return data; // Return data for 3D mode handling
  } catch (err) {
    // Hide modal on error
    hideBookChangeModal();
    state.loading = false;
    updateButtonStates();
    
    // Check if this is a "no plain text" error
    if (err.message && err.message.includes('No plain text')) {
      // If this was initiated from search, show a modal so user can continue searching
      if (searchInitiatedLoad) {
        searchInitiatedLoad = false;
        showErrorModal(`This book is not available in plain text format.\n\nTry searching for a different edition or another book.`);
        openSearch(); // Re-open search so user can continue
      } else {
        // Not from search - show in content area
        $('content').className = 'error';
        $('content').textContent = `Error: ${err.message}`;
      }
    } else {
      // Other errors - show in content area
      $('content').className = 'error';
      $('content').textContent = `Error: ${err.message}`;
    }
    return null; // Indicate failure
  }
}

async function navigate(direction) {
  if (state.loading || !state.bookId) return;

  if (direction === 'forward') {
    if (state.nextByteStart == null) {
      // End of book - check if in auto mode
      if (isAutoModeActive()) {
        teleportToRandomLocation();
      } else {
        showEndOfBookModal('forward');
      }
      return;
    }

    state.loading = true;
    try {
      navHistoryStack.push(state.byteStart);
      const data = await fetchChunk(state.bookId, state.nextByteStart, state.chunkSize);
      
      // If we got 0 words, we've hit end of actual content
      if (data.actualCount === 0 || (data.words && data.words.length === 0)) {
        navHistoryStack.pop(); // Don't keep this in history
        state.loading = false;
        if (isAutoModeActive()) {
          teleportToRandomLocation();
        } else {
          showEndOfBookModal('forward');
        }
        return;
      }
      
      updateUI(data);
      showHint('→');
    } catch (err) {
      navHistoryStack.pop();
      $('content').className = 'error';
      $('content').textContent = `Error: ${err.message}`;
    } finally {
      state.loading = false;
      updateButtonStates();
    }
  } else {
    // Check if at start of book - use percent since byte thresholds are unreliable
    const currentPercent = parseFloat($('percent').textContent) || 0;
    const atDocStart = currentPercent <= 0.5 && navHistoryStack.length === 0;
    if (atDocStart) {
      // Start of book - check if in auto mode
      if (isAutoModeActive()) {
        teleportToRandomLocation();
      } else {
        showEndOfBookModal('backward');
      }
      return;
    }
    
    // If no history but not at doc start, calculate previous position
    if (navHistoryStack.length === 0) {
      // Go back by roughly one chunk worth of bytes
      const bytesPerWord = 6; // approximate
      const bytesToGoBack = state.chunkSize * bytesPerWord;
      const prevByteStart = Math.max(state.docStart || 0, state.byteStart - bytesToGoBack);
      
      // If we can't make meaningful progress backward
      // Use chunk-relative threshold: expect at least 50% of the intended movement
      const minProgress = Math.max(1, Math.floor(bytesToGoBack * 0.5));
      if (prevByteStart >= state.byteStart - minProgress) {
        if (isAutoModeActive()) {
          teleportToRandomLocation();
        } else {
          showEndOfBookModal('backward');
        }
        return;
      }
      
      state.loading = true;
      try {
        const data = await fetchChunk(state.bookId, prevByteStart, state.chunkSize);
        
        // If we got 0 words, at start of book
        if (data.actualCount === 0 || (data.words && data.words.length === 0)) {
          state.loading = false;
          if (isAutoModeActive()) {
            teleportToRandomLocation();
          } else {
            showEndOfBookModal('backward');
          }
          return;
        }
        
        // If returned percent is very low (near start)
        const returnedPercent = parseFloat(data.percent) || 0;
        if (returnedPercent <= 0.5) {
          updateUI(data);
          showHint('← Start of book');
          state.loading = false;
          if (isAutoModeActive()) {
            setTimeout(() => teleportToRandomLocation(), 500);
          } else {
            setTimeout(() => showEndOfBookModal('backward'), 500);
          }
          return;
        }
        
        updateUI(data);
        showHint('←');
      } catch (err) {
        $('content').className = 'error';
        $('content').textContent = `Error: ${err.message}`;
      } finally {
        state.loading = false;
        updateButtonStates();
      }
      return;
    }

    state.loading = true;
    try {
      const prevByteStart = navHistoryStack.pop();
      const data = await fetchChunk(state.bookId, prevByteStart, state.chunkSize);
      
      // Defensive: if 0 words, at start of book
      if (data.actualCount === 0 || (data.words && data.words.length === 0)) {
        state.loading = false;
        if (isAutoModeActive()) {
          teleportToRandomLocation();
        } else {
          showEndOfBookModal('backward');
        }
        return;
      }
      
      updateUI(data);
      showHint('←');
    } catch (err) {
      $('content').className = 'error';
      $('content').textContent = `Error: ${err.message}`;
    } finally {
      state.loading = false;
      updateButtonStates();
    }
  }
}
