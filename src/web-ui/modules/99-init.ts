// @ts-nocheck
// ========== Initial load ==========
try {
  if (isExcerptMode()) {
    initExcerptMode();
  } else {
    const params = parseHash();
    if (params) {
      state.chunkSize = params.chunkSize;
      
      // Load content first, then switch mode if needed
      initBook(params.bookId, params.byteStart, params.chunkSize).then((data) => {
        // Only switch to 3D mode if content loaded successfully
        if (data && params.mode === '3d' && !rope3d.active) {
          toggleRopeMode();
        }
      });
    } else {
      // No hash - check for last position
      loadLastPosition().then(lastPos => {
        if (lastPos && lastPos.bookId) {
          // Resume from last position
          state.chunkSize = lastPos.chunkSize || 200;
          initBook(lastPos.bookId, lastPos.byteStart, state.chunkSize).then((data) => {
            if (data && lastPos.mode === '3d' && !rope3d.active) {
              toggleRopeMode();
            }
          });
        } else {
          $('content').className = 'error';
          $('content').textContent = 'No book specified. Use URL like /read#1342 or search for a book.';
        }
      }).catch(() => {
        $('content').className = 'error';
        $('content').textContent = 'No book specified. Use URL like /read#1342 or search for a book.';
      });
    }
  }
} catch (err) {
  console.error('Initial load error:', err);
  $('content').className = 'error';
  $('content').textContent = `Initialization error: ${err.message}`;
}

// Focus main content for keyboard navigation
$('mainContent').focus();

// Empty export to make TypeScript treat this as a module
export {};
