// @ts-nocheck
// ========== Random menu ==========
function openRandomMenu() {
  // Auto mode continues uninterrupted in all modes
  $('randomOverlay').classList.add('visible');
  $('randomPanel').focus();
}

function closeRandomMenu() {
  $('randomOverlay').classList.remove('visible');
  // Focus appropriate element based on mode
  if (rope3d.active) {
    rope3d.canvas.focus();
  } else {
    $('mainContent').focus();
  }
}

async function goToRandomBook() {
  closeRandomMenu();
  state.loading = true;
  updateButtonStates();
  $('content').className = 'loading';
  $('content').textContent = 'Finding a random book...';
  
  const modal = $('teleportModal');
  const MAX_RETRIES = 10;
  let attempts = 0;
  const lang = $('searchLanguage').value;

  while (attempts < MAX_RETRIES) {
    attempts++;
    try {
      const res = await fetch('/api/random?lang=' + encodeURIComponent(lang));
      const book = await res.json();

      if (book.error) throw new Error(book.error);
      
      // Show the modal with book info
      showBookChangeModal(book.title, book.author, false);
      
      // Random Book always starts at the BEGINNING of the book (null = docStart)
      const data = await initBook(parseInt(book.id, 10), null, state.chunkSize, true, true);

      // If initBook failed, try another book
      if (!data) {
        hideBookChangeModal();
        continue;
      }

      // Update URL AFTER successful content load to prevent URL/content mismatch
      const newHash = buildHash(data.bookId, data.byteStart, state.chunkSize, rope3d.active);
      window.history.replaceState(null, '', newHash);

      // CRITICAL: Re-set loading state to prevent animation loop from processing
      // with stale rope3d data. initBook's finally block sets state.loading = false,
      // but we need to update rope3d before allowing animation to proceed.
      if (rope3d.active) {
        state.loading = true;
      }

      // Sync 3D mode if active - use returned data directly for reliability
      if (rope3d.active) {
        // Fade out, update words, fade in
        fadeCanvas(0.3, 100, () => {
          const newText = data.formattedText || data.words.join(' ');
          const words = tokenizeForRope(newText);
          setRopeWords(words);
          rope3d.wordOffset = 0;
          // Preserve momentum if auto-read is active for graceful transition
          if (!autoRead.active) {
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
          
          // Fade back in
          fadeCanvas(1, 100);
        });
        
        // Now it's safe to allow animation loop to proceed
        state.loading = false;
      }
      
      // Fade out modal, re-enable buttons when modal hides
      setTimeout(() => {
        modal.classList.remove('visible');
        updateButtonStates();
      }, 500);

      showHint(`📚 ${book.title?.substring(0, 30) || book.id} — from the beginning`);
      return; // Success, exit the retry loop
    } catch (err) {
      // Check if this is a "no plain text" error - retry with a different book
      if (err.message && err.message.includes('No plain text')) {
        console.log(`Book has no plain text, trying another... (attempt ${attempts})`);
        modal.classList.remove('visible');
        continue; // Try another random book
      }
      
      // Other errors - show and exit
      modal.classList.remove('visible');
      $('content').className = 'error';
      $('content').textContent = `Error: ${err.message}`;
      state.loading = false;
      updateButtonStates();
      return;
    }
  }
  
  // Exhausted retries
  modal.classList.remove('visible');
  $('content').className = 'error';
  $('content').textContent = 'Could not find a book with plain text after multiple attempts.';
  state.loading = false;
  updateButtonStates();
}

async function goToRandomLocation() {
  closeRandomMenu();
  
  // Auto mode continues uninterrupted
  
  state.loading = true;
  updateButtonStates();
  $('content').className = 'loading';
  $('content').textContent = 'Finding a random location...';
  
  const modal = $('teleportModal');
  const MAX_RETRIES = 10;
  let attempts = 0;
  const lang = $('searchLanguage').value;

  while (attempts < MAX_RETRIES) {
    attempts++;
    try {
      const res = await fetch('/api/random?lang=' + encodeURIComponent(lang));
      const book = await res.json();

      if (book.error) throw new Error(book.error);
      
      // Show the modal with book info
      showBookChangeModal(book.title, book.author, false);

      // Random Location: pick a random penetration percentage (5-95%)
      // This ensures we're always "inside" the book, not at the very beginning or end
      const randomPercent = Math.floor(Math.random() * 90) + 5;

      // Use current chunk size setting
      const currentChunkSize = state.chunkSize;

      // First init the book to get boundaries
      $('content').textContent = `Loading ${book.title?.substring(0, 20) || book.id}...`;

      // Init book to get total bytes
      const initRes = await fetch(`/api/book/${book.id}/init?chunkSize=${currentChunkSize}`);
      const initData = await initRes.json();

      if (initData.error) {
        // Check if this is a "no plain text" error - retry with a different book
        if (initData.error.includes('No plain text')) {
          console.log(`Book has no plain text, trying another... (attempt ${attempts})`);
          modal.classList.remove('visible');
          continue; // Try another random book
        }
        throw new Error(initData.error);
      }

      // Calculate random byte position based on percentage
      const totalCleanBytes = initData.docEnd - initData.docStart;
      const randomByteOffset = Math.floor(totalCleanBytes * (randomPercent / 100));
      const randomByteStart = initData.docStart + randomByteOffset;
      
      const data = await initBook(parseInt(book.id, 10), randomByteStart, currentChunkSize, true, true);

      // If initBook failed, try another book
      if (!data) {
        hideBookChangeModal();
        continue;
      }

      // Update URL AFTER successful content load to prevent URL/content mismatch
      const newHash = buildHash(data.bookId, data.byteStart, currentChunkSize, rope3d.active);
      window.history.replaceState(null, '', newHash);

      // CRITICAL: Re-set loading state to prevent animation loop from processing
      // with stale rope3d data. initBook's finally block sets state.loading = false,
      // but we need to update rope3d before allowing animation to proceed.
      if (rope3d.active) {
        state.loading = true;
      }

      // Sync 3D mode if active - use returned data directly for reliability
      if (rope3d.active) {
        // Fade out, update words, fade in
        fadeCanvas(0.3, 100, () => {
          const newText = data.formattedText || data.words.join(' ');
          const words = tokenizeForRope(newText);
          setRopeWords(words);
          rope3d.wordOffset = 0;
          // Preserve momentum if auto-read is active for graceful transition
          if (!autoRead.active) {
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
          
          // Fade back in
          fadeCanvas(1, 100);
        });
        
        // Now it's safe to allow animation loop to proceed
        state.loading = false;
      }
      
      // Fade out modal, re-enable buttons when modal hides
      setTimeout(() => {
        modal.classList.remove('visible');
        updateButtonStates();
      }, 500);

      const title = book.title?.substring(0, 25) || `Book ${book.id}`;
      showHint(`🎯 ${title} @ ${randomPercent}%`);
      return; // Success, exit the retry loop
    } catch (err) {
      // Check if this is a "no plain text" error - retry with a different book
      if (err.message && err.message.includes('No plain text')) {
        console.log(`Book has no plain text, trying another... (attempt ${attempts})`);
        modal.classList.remove('visible');
        continue; // Try another random book
      }
      
      // Other errors - show and exit
      modal.classList.remove('visible');
      $('content').className = 'error';
      $('content').textContent = `Error: ${err.message}`;
      state.loading = false;
      updateButtonStates();
      return;
    }
  }
  
  // Exhausted retries
  modal.classList.remove('visible');
  $('content').className = 'error';
  $('content').textContent = 'Could not find a book with plain text after multiple attempts.';
  state.loading = false;
  updateButtonStates();
}

// Random menu event listeners
$('randomClose').addEventListener('click', closeRandomMenu);
$('randomOverlay').addEventListener('click', (e) => {
  if (e.target === $('randomOverlay')) closeRandomMenu();
});
$('randomBookBtn').addEventListener('click', goToRandomBook);
$('randomLocationBtn').addEventListener('click', goToRandomLocation);
$('jumpAroundGlobalBtn').addEventListener('click', startGlobalJumpAround);
$('jumpAroundSameBookBtn').addEventListener('click', startSameBookJumpAround);

// Random menu keyboard shortcuts (when modal is open)
$('randomPanel').addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'escape') {
    closeRandomMenu();
    return;
  }
  if (key === 'b') {
    e.preventDefault();
    e.stopPropagation();
    goToRandomBook();
    return;
  }
  if (key === 'l') {
    e.preventDefault();
    e.stopPropagation();
    goToRandomLocation();
    return;
  }
  if (key === 'j') {
    e.preventDefault();
    e.stopPropagation();
    startGlobalJumpAround();
    return;
  }
  if (key === 't') {
    e.preventDefault();
    e.stopPropagation();
    startSameBookJumpAround();
    return;
  }
});
