// @ts-nocheck
// ========== Book info and display ==========

// Show interstitial modal when changing books
function showBookChangeModal(title, author, autoHide = true) {
  const modal = $('teleportModal');
  // Format: *Title* — Author
  let info = '';
  if (title) {
    info = `<em>${escapeHtml(title)}</em>`;
    if (author) {
      info += ` — ${escapeHtml(author)}`;
    }
  } else {
    info = 'Loading...';
  }
  $('teleportInfo').innerHTML = info;
  modal.classList.add('visible');
  
  if (autoHide) {
    // Auto-hide after 500ms (short enough to not feel sluggish)
    setTimeout(() => modal.classList.remove('visible'), 500);
  }
  
  return modal;
}

function hideBookChangeModal() {
  $('teleportModal').classList.remove('visible');
}

// End of book confirmation modal functions
function showEndOfBookModal(direction) {
  const overlay = $('endOfBookOverlay');
  const title = $('endOfBookTitle');
  const message = $('endOfBookMessage');
  
  if (direction === 'forward') {
    title.textContent = 'End of Book';
    message.textContent = 'You have reached the end of this book.';
  } else {
    title.textContent = 'Beginning of Book';
    message.textContent = 'You have reached the beginning of this book.';
  }
  
  overlay.classList.add('visible');
  $('endOfBookNo').focus();
}

function hideEndOfBookModal() {
  $('endOfBookOverlay').classList.remove('visible');
}

function isAutoModeActive() {
  return autoRead.active || jumpAround.active;
}

async function fetchBookInfo(bookId) {
  try {
    const res = await fetch(`/api/bookinfo/${bookId}`);
    const data = await res.json();

    const parts = [];
    if (data.title) {
      state.bookTitle = data.title;
      parts.push(`<span class="title">${escapeHtml(data.title)}</span>`);
    }
    if (data.author) {
      const formatted = data.author
        .replace(/,\s*\d{4}-\d{4}/g, '')
        .replace(/,\s*\d{4}-/g, '')
        .replace(/,\s*-\d{4}/g, '')
        .replace(/\s*\[.*?\]/g, '')
        .split('; ')
        .map(name => name.split(', ').reverse().join(' ').trim())
        .join(', ');
      state.bookAuthor = formatted;
      parts.push(`<span class="author">by ${escapeHtml(formatted)}</span>`);
    }

    // Update title bar
    $('titleBarTitle').textContent = state.bookTitle || `Book ${state.bookId}`;
    $('titleBarAuthor').textContent = state.bookAuthor || '';

    // Update teleport modal if visible (for direct URL navigation)
    const modal = $('teleportModal');
    if (modal.classList.contains('visible') && state.bookTitle) {
      let info = `<em>${escapeHtml(state.bookTitle)}</em>`;
      if (state.bookAuthor) {
        info += ` — ${escapeHtml(state.bookAuthor)}`;
      }
      $('teleportInfo').innerHTML = info;
    }

    updateDocumentTitle();
  } catch (err) {}
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Tokenize text for 3D rope display, splitting at word boundaries
// Handles: em-dashes, pipes, hyphens, case transitions, punctuation+capital
function tokenizeForRope(text) {
  const tokens = [];
  const chunks = text.split(/\s+/).filter(c => c.length > 0);
  
  for (const chunk of chunks) {
    // First pass: split on obvious separators
    // - Em-dash/en-dash (always word boundaries)
    // - Pipe character
    // - Hyphens between letters (compound words)
    let parts = chunk.split(/(—|–|\||(?<=[a-zA-Z])-(?=[a-zA-Z]))/);
    
    // Second pass: for each part, detect case-based word boundaries
    const finalParts = [];
    for (const part of parts) {
      if (!part || part.length === 0) continue;
      if (part === '—' || part === '–' || part === '|' || part === '-') {
        finalParts.push(part);
        continue;
      }
      
      // Split on case transitions:
      // 1. lowercase followed by uppercase: "americaTO" -> "america", "TO"
      // 2. uppercase followed by uppercase then lowercase: "YORKCopyright" -> "YORK", "Copyright"  
      // 3. After sentence-ending punctuation followed by capital letter
      //    (but NOT opening quotes, apostrophes, or abbreviations like e.g.)
      
      const subparts = part.split(
        /(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-zA-Z][.!?:;]["'""'']*)(?=[A-Z])/
      );
      
      for (const sp of subparts) {
        if (sp && sp.length > 0) {
          finalParts.push(sp);
        }
      }
    }
    
    tokens.push(...finalParts);
  }
  
  return tokens;
}

// Process underscore-wrapped text as italics
// Handles both _single_ words and _multiple word_ phrases
function processItalics(text) {
  // First escape HTML, then replace underscore patterns with italic tags
  let escaped = escapeHtml(text);
  // Replace _text_ patterns with <em>text</em>
  // This regex handles: _word_, _multiple words_
  // Non-greedy match to handle multiple italic sections
  escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>');
  return escaped;
}

// Check if a word should be rendered in italic (for 3D mode)
// Also returns the cleaned word without underscore markers
function getWordItalicInfo(word, prevItalicState) {
  let isItalic = prevItalicState.active;
  let cleanWord = word;
  let startsItalic = false;
  let endsItalic = false;
  
  // Check for starting underscore
  if (word.startsWith('_')) {
    cleanWord = cleanWord.substring(1);
    startsItalic = true;
    isItalic = true;
  }
  
  // Check for ending underscore
  if (cleanWord.endsWith('_')) {
    cleanWord = cleanWord.substring(0, cleanWord.length - 1);
    endsItalic = true;
  }
  
  // If ends with underscore, italic ends after this word
  const nextItalicState = {
    active: startsItalic ? !endsItalic : (isItalic && !endsItalic)
  };
  
  return {
    cleanWord,
    isItalic: isItalic || startsItalic,
    nextState: nextItalicState
  };
}

// Process an array of words and return cleaned words + italic map
function processWordsForItalic(words) {
  const cleanWords = [];
  const italicMap = [];
  let italicState = { active: false };
  
  for (const word of words) {
    const info = getWordItalicInfo(word, italicState);
    cleanWords.push(info.cleanWord);
    italicMap.push(info.isItalic);
    italicState = info.nextState;
  }
  
  return { cleanWords, italicMap };
}

// Helper to set rope words with italic processing
function setRopeWords(words) {
  const { cleanWords, italicMap } = processWordsForItalic(words);
  rope3d.allWords = cleanWords;
  rope3d.wordItalicMap = italicMap;
}

// Helper to append words to rope with italic processing
function appendRopeWords(newWords) {
  const { cleanWords, italicMap } = processWordsForItalic(newWords);
  rope3d.allWords = rope3d.allWords.concat(cleanWords);
  rope3d.wordItalicMap = rope3d.wordItalicMap.concat(italicMap);
}

// Helper to prepend words to rope with italic processing
function prependRopeWords(newWords) {
  const { cleanWords, italicMap } = processWordsForItalic(newWords);
  rope3d.allWords = cleanWords.concat(rope3d.allWords);
  rope3d.wordItalicMap = italicMap.concat(rope3d.wordItalicMap);
}

function parseHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;

  const parts = hash.split(',').map(p => p.trim());
  const bookId = parseInt(parts[0], 10);
  if (isNaN(bookId)) return null;

  const byteStart = parts[1] ? parseInt(parts[1], 10) : null;
  const chunkSize = parts[2] ? parseInt(parts[2], 10) : 200;
  const mode = parts[3] === '3d' ? '3d' : '2d';

  return {
    bookId,
    byteStart: (byteStart !== null && !isNaN(byteStart)) ? byteStart : null,
    chunkSize: (!isNaN(chunkSize) && chunkSize > 0) ? chunkSize : 200,
    mode
  };
}

function buildHash(bookId, byteStart, chunkSize, is3d) {
  const base = `#${bookId},${byteStart ?? 0},${chunkSize}`;
  return is3d ? `${base},3d` : base;
}

let lastHashUpdate = 0;
const HASH_UPDATE_INTERVAL = 500; // Only update hash every 500ms

async function loadLastPosition() {
  try {
    const res = await fetch('/api/lastpos');
    if (res.ok) {
      const pos = await res.json();
      return pos;
    }
  } catch (e) {
    // Ignore errors loading last position
  }
  return null;
}

function updateHash(force = false) {
  const now = Date.now();
  if (!force && now - lastHashUpdate < HASH_UPDATE_INTERVAL) {
    return; // Throttled - skip this update
  }
  
  try {
    const byteStart = state.byteStart ?? 0;
    const newHash = buildHash(state.bookId, byteStart, state.chunkSize, rope3d.active);
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
      lastHashUpdate = now;
    }
  } catch (e) {
    // Ignore security errors in sandboxed contexts
  }
}

function updateButtonStates() {
  const inAutoMode = autoRead.active;
  const shouldDisableNav = state.loading || inAutoMode;
  $('btnBack').disabled = shouldDisableNav;
  $('btnForward').disabled = shouldDisableNav;
  $('autoInterval').disabled = !(inAutoMode || jumpAround.active);
  // Only enable direction dropdown when auto motion is active
  $('autoDirection').disabled = !(inAutoMode || jumpAround.active);
  
  // Sync mobile nav buttons (repurposed p2p/debug toggles)
  const mobileBack = $('p2pToggle');
  const mobileForward = $('debugToggle');
  if (mobileBack && mobileBack.dataset.mobileNav === 'back') {
    mobileBack.disabled = $('btnBack').disabled;
  }
  if (mobileForward && mobileForward.dataset.mobileNav === 'forward') {
    mobileForward.disabled = $('btnForward').disabled;
  }
}

function syncChunkSizeDropdown() {
  const select = $('autoChunkSize');
  const options = Array.from(select.options).map(o => parseInt(o.value, 10));

  if (options.includes(state.chunkSize)) {
    select.value = state.chunkSize;
  } else {
    const customOpt = select.querySelector('option[data-custom]');
    if (customOpt) {
      customOpt.value = state.chunkSize;
      customOpt.textContent = `${state.chunkSize}w`;
    } else {
      const opt = document.createElement('option');
      opt.value = state.chunkSize;
      opt.textContent = `${state.chunkSize}w`;
      opt.setAttribute('data-custom', 'true');
      select.appendChild(opt);
    }
    select.value = state.chunkSize;
  }
}

function updateUI(data) {
  state.bookId = data.bookId;
  state.byteStart = data.byteStart ?? 0;
  state.byteEnd = data.byteEnd ?? 0;
  state.nextByteStart = data.nextByteStart ?? null;
  state.chunkSize = data.chunkSize || state.chunkSize;
  
  // Track document boundaries for backward navigation
  if (data.docStart !== undefined) state.docStart = data.docStart;
  if (data.docEnd !== undefined) state.docEnd = data.docEnd;

  // Update title bar
  $('titleBarTitle').textContent = state.bookTitle || `Book ${data.bookId}`;
  $('titleBarAuthor').textContent = state.bookAuthor || '';
  $('percent').textContent = `${data.percent}%`;
  $('progressFill').style.width = `${data.percent}%`;
  $('progress').style.width = `${data.percent}%`;
  $('content').className = '';

  const displayText = data.formattedText || data.words.join(' ');
  // Process italics (underscore-wrapped text) and then handle paragraph breaks
  $('content').innerHTML = processItalics(displayText).replace(/\n\n/g, '<br><br>');

  $('stats').textContent = `${data.totalBytes.toLocaleString()} bytes | ${state.chunkSize}w`;
  
  // Update footer location display
  updateFooterLocation();

  updateButtonStates();
  syncChunkSizeDropdown();
  updateDocumentTitle();
  syncAutoReadUI(); // Ensure button state matches actual auto-read state
  
  // Re-apply text scale for iOS Safari compatibility
  // (iOS can lose CSS custom property values after DOM updates)
  const savedSize = localStorage.getItem('gutex-text-size') || 'normal';
  applyTextSize(savedSize);
  
  // Sync rope 3D mode if active
  syncRopeWords();
  
  // Record in navigation history
  recordNavigation();
}

// Update the footer location display with current byte position
function updateFooterLocation() {
  const locationEl = $('footerLocation');
  if (!locationEl) return;
  
  // In 3D mode, use viewBytePosition for accurate tracking
  const currentPosition = rope3d.active 
    ? Math.floor(rope3d.viewBytePosition) 
    : state.byteStart;
  
  if (currentPosition !== undefined) {
    locationEl.textContent = currentPosition.toLocaleString();
    locationEl.title = `Click to copy URL for this location`;
  }
}

// Build fully qualified URL for current location
function buildLocationUrl() {
  // In 3D mode, use viewBytePosition for accurate position
  const currentPosition = rope3d.active 
    ? Math.floor(rope3d.viewBytePosition) 
    : state.byteStart;
  const hash = buildHash(state.bookId, currentPosition, state.chunkSize, rope3d.active);
  return window.location.origin + window.location.pathname + hash;
}

// Copy location URL to clipboard when clicked
function copyFooterLocation() {
  const locationEl = $('footerLocation');
  if (!locationEl || state.byteStart === undefined || !state.bookId) return;
  
  const url = buildLocationUrl();
  
  navigator.clipboard.writeText(url).then(() => {
    locationEl.classList.add('copied');
    const originalText = locationEl.textContent;
    locationEl.textContent = 'Copied!';
    setTimeout(() => {
      locationEl.classList.remove('copied');
      locationEl.textContent = originalText;
    }, 1500);
  }).catch(() => {
    // Fallback for browsers without clipboard API
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    
    locationEl.classList.add('copied');
    const originalText = locationEl.textContent;
    locationEl.textContent = 'Copied!';
    setTimeout(() => {
      locationEl.classList.remove('copied');
      locationEl.textContent = originalText;
    }, 1500);
  });
}

// Initialize footer location click handler
const footerLocationEl = $('footerLocation');
if (footerLocationEl) {
  footerLocationEl.addEventListener('click', copyFooterLocation);
}

function updateDocumentTitle() {
  const addr = `${state.bookId}/${state.byteStart}–${state.byteEnd}/${state.chunkSize}`;
  if (state.bookTitle) {
    const parts = [state.bookTitle];
    if (state.bookAuthor) parts.push(state.bookAuthor);
    document.title = `${parts.join(' — ')} [${addr}] — Gutex`;
  } else {
    document.title = `[${addr}] — Gutex`;
  }
}

function showHint(text, duration = 1000) {
  // Suppress hints during auto-read to avoid animation interrupts
  if (autoRead.active) return;
  
  const hint = $('navHint');
  hint.textContent = text;
  hint.classList.add('visible');
  setTimeout(() => hint.classList.remove('visible'), duration);
}
