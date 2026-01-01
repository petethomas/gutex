// @ts-nocheck
// ========== Gutex Web UI ==========
// TypeScript conversion with guaranteed functional parity
// Using @ts-nocheck to ensure exact JavaScript output

// ========== Theme Management ==========
function initTheme() {
  // Check URL parameter first (for excerpt mode)
  const urlParams = new URLSearchParams(window.location.search);
  const urlTheme = urlParams.get('theme');
  const savedTheme = urlTheme || localStorage.getItem('gutex-theme') || 'default';
  applyTheme(savedTheme);
  const select = document.getElementById('themeSelect');
  if (select) select.value = savedTheme;
  
  // Load saved language preference into search language selector
  const savedLanguage = localStorage.getItem('gutex-language') || 'en';
  const searchLangSelect = document.getElementById('searchLanguage');
  if (searchLangSelect) searchLangSelect.value = savedLanguage;
  
  // Sync overflow menu theme select
  const overflowTheme = document.getElementById('overflowTheme');
  if (overflowTheme) overflowTheme.value = savedTheme;
}

function applyTheme(theme) {
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('gutex-theme', theme);
  
  // Update 3D canvas if active (safely check for rope3d)
  try {
    if (rope3d && rope3d.active) {
      requestAnimationFrame(() => renderRopeFrame());
    }
  } catch (e) {
    // rope3d not yet initialized, ignore
  }
}

const THEMES = ['default', 'dark', 'scifi', 'greenfield', 'stoneworks', 'redbrick', 'midnight', 'amber'];
const THEME_NAMES = {
  'default': 'Default',
  'dark': 'Dark',
  'scifi': 'Sci-Fi',
  'greenfield': 'Greenfield',
  'stoneworks': 'Stoneworks',
  'redbrick': 'Redbrick',
  'midnight': 'Midnight',
  'amber': 'Amber'
};

function cycleTheme() {
  const current = localStorage.getItem('gutex-theme') || 'default';
  const currentIndex = THEMES.indexOf(current);
  const nextIndex = (currentIndex + 1) % THEMES.length;
  const nextTheme = THEMES[nextIndex];
  
  applyTheme(nextTheme);
  
  // Update dropdowns
  const select = document.getElementById('themeSelect');
  if (select) select.value = nextTheme;
  const overflowTheme = document.getElementById('overflowTheme');
  if (overflowTheme) overflowTheme.value = nextTheme;
  
  // Show hint
  showHint(`Theme: ${THEME_NAMES[nextTheme]}`, 1000);
}

// Initialize theme immediately to prevent flash
initTheme();

// ========== Text Size ==========
const TEXT_SIZES = {
  'small': 0.875,
  'normal': 1,
  'large': 1.15
};
const TEXT_SIZE_NAMES = {
  'small': 'Small text',
  'normal': 'Normal text',
  'large': 'Large text'
};

function initTextSize() {
  const savedSize = localStorage.getItem('gutex-text-size') || 'normal';
  applyTextSize(savedSize);
  
  const select = document.getElementById('textSizeSelect');
  if (select) select.value = savedSize;
  
  const overflowSelect = document.getElementById('overflowTextSize');
  if (overflowSelect) overflowSelect.value = savedSize;
}

function applyTextSize(size) {
  const scale = TEXT_SIZES[size] || 1;
  // Set CSS custom property for non-content elements
  document.documentElement.style.setProperty('--text-scale', String(scale));
  
  // Use body classes for #content font-size (more stable on iOS)
  document.body.classList.remove('text-size-small', 'text-size-normal', 'text-size-large');
  document.body.classList.add(`text-size-${size}`);
  
  localStorage.setItem('gutex-text-size', size);
}

function cycleTextSize() {
  const sizes = Object.keys(TEXT_SIZES);
  const current = localStorage.getItem('gutex-text-size') || 'normal';
  const currentIndex = sizes.indexOf(current);
  const nextIndex = (currentIndex + 1) % sizes.length;
  const nextSize = sizes[nextIndex];
  
  applyTextSize(nextSize);
  
  // Update dropdowns
  const select = document.getElementById('textSizeSelect');
  if (select) select.value = nextSize;
  const overflowSelect = document.getElementById('overflowTextSize');
  if (overflowSelect) overflowSelect.value = nextSize;
  
  showHint(`${TEXT_SIZE_NAMES[nextSize]}`, 1000);
}

// Initialize text size immediately to prevent flash
initTextSize();

// ========== Mobile Detection & Hardening ==========
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
  || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Hide fullscreen button on iOS (not supported) and add mobile class
if (isMobile) {
  document.body.classList.add('is-mobile');
}
if (isIOS) {
  document.body.classList.add('is-ios');
}

// Check fullscreen support and hide button if not available
function checkFullscreenSupport() {
  const canFullscreen = document.fullscreenEnabled || 
    document.webkitFullscreenEnabled || 
    document.mozFullScreenEnabled ||
    document.msFullscreenEnabled;
  
  if (!canFullscreen) {
    const fsBtn = document.getElementById('fullscreenBtn');
    const fsOverflow = document.getElementById('overflowFullscreen');
    if (fsBtn) fsBtn.style.display = 'none';
    if (fsOverflow) fsOverflow.style.display = 'none';
  }
}
checkFullscreenSupport();

// Prevent iOS context menu on long-press for interactive elements
if (isMobile) {
  document.addEventListener('contextmenu', function(e) {
    if (e.target.closest('button, .bookmark-item, .history-item, .search-result-item')) {
      e.preventDefault();
    }
  });

  // Prevent double-tap zoom on buttons
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300 && e.target.closest('button, a, .bookmark-item, .history-item')) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  // Repurpose p2p-toggle (bottom left) as Back button
  // Repurpose debug-toggle (bottom right) as Forward button
  const p2pBtn = document.getElementById('p2pToggle');
  const debugBtn = document.getElementById('debugToggle');
  
  if (p2pBtn) {
    p2pBtn.innerHTML = '◀';
    p2pBtn.title = 'Back';
    p2pBtn.dataset.mobileNav = 'back';
    p2pBtn.disabled = true;
  }
  
  if (debugBtn) {
    debugBtn.innerHTML = '▶';
    debugBtn.title = 'Forward';
    debugBtn.dataset.mobileNav = 'forward';
    debugBtn.disabled = true;
  }
}

const state = {
  bookId: null,
  bookTitle: null,
  bookAuthor: null,
  byteStart: 0,
  byteEnd: 0,
  nextByteStart: null,
  docStart: 0,       // Start of document content (for backward boundary check)
  docEnd: 0,         // End of document content
  chunkSize: 200,
  loading: false,
  lastFetchDuration: null
};

const autoRead = {
  active: false,
  intervalId: null,
  minInterval: 1000
};

// Jump Around mode state
const jumpAround = {
  active: false,
  sameBook: false,  // true = same book only, false = global random
  timeoutId: null,
  countdownId: null,
  nextJumpTime: null,
  interval: 60000   // 60 seconds
};

// Jump Around mode functions
function getJumpInterval() {
  const selectedSeconds = parseInt($('autoInterval').value, 10);
  const selectedMs = selectedSeconds * 1000;
  
  // Minimum safe interval: p90 latency + 1 second buffer
  const p90 = latencyTracker.getP90();
  const minSafeMs = p90 + 1000;
  
  if (selectedMs >= minSafeMs) {
    return selectedMs;
  }
  
  // Bump up to minimum safe interval and notify user
  const adjustedSeconds = Math.ceil(minSafeMs / 1000);
  showHint(`Interval adjusted to ${adjustedSeconds}s (network)`, 1500);
  return minSafeMs;
}

function startJumpAround(sameBookOnly = false) {
  jumpAround.active = true;
  jumpAround.sameBook = sameBookOnly;
  
  // Update indicator text based on mode (with stop hint)
  if (sameBookOnly) {
    $('modeIndicatorText').textContent = 'Jumping in book · click to stop';
  } else {
    $('modeIndicatorText').textContent = 'Jump Around · click to stop';
  }
  $('modeIndicatorCountdown').textContent = '';
  $('modeIndicator').classList.remove('auto-only');
  $('modeIndicator').classList.add('visible');
  
  // Start countdown update interval
  jumpAround.countdownId = setInterval(updateJumpCountdown, 100);
  
  // Disable some controls (but keep fullscreen, mode toggle, bookmark enabled)
  // Keep chunk size and direction dropdowns enabled so user can change them dynamically
  $('btnBack').disabled = true;
  $('btnForward').disabled = true;
  $('btnAuto').disabled = true;
  $('randomBtn').disabled = true;
  $('autoChunkSize').disabled = false;  // Allow dynamic chunk size changes
  $('autoInterval').disabled = false;
  $('autoDirection').disabled = false;  // Allow direction changes
  $('searchToggle').disabled = true;
  $('excerptBtn').disabled = true;
  $('homeBtn').disabled = true;
  
  // In 3D mode: use auto-read for smooth scrolling animation
  // In 2D mode: stop any existing auto-read, jumping takes precedence
  // Respect user's direction preference in both modes
  if (rope3d.active) {
    if (!autoRead.active) {
      startAutoRead();
    }
  } else {
    // 2D mode - Jump Around works independently of auto mode
    // Auto mode continues uninterrupted if it's running
  }
  
  // For global mode, do an immediate first jump to a new book
  // This makes it clear that Jump Around is different from regular auto
  if (!sameBookOnly) {
    fadeAndExecute(() => goToRandomLocation());
  }
  
  scheduleNextJump();
}

function updateJumpCountdown() {
  if (!jumpAround.active || !jumpAround.nextJumpTime) {
    $('modeIndicatorCountdown').textContent = '';
    return;
  }
  const remaining = Math.max(0, jumpAround.nextJumpTime - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  $('modeIndicatorCountdown').textContent = `(${seconds}s)`;
}

async function goToRandomLocationInSameBook() {
  // Jump to random location within current book only
  if (!state.bookId) return;
  
  const docStart = state.docStart || 0;
  const docEnd = state.docEnd || 100000;
  const docLength = docEnd - docStart;
  
  // Pick random position 5-95% through
  const randomPercent = 0.05 + Math.random() * 0.90;
  const targetByte = Math.floor(docStart + docLength * randomPercent);
  
  try {
    const data = await fetchChunk(state.bookId, targetByte, state.chunkSize);
    
    // Abort if Jump Around was stopped during fetch
    if (!jumpAround.active) return;
    
    if (rope3d.active) {
      // 3D mode: Fade out, swap words, fade in
      fadeCanvas(0.3, 100, () => {
        const newText = data.formattedText || data.words.join(' ');
        const words = newText.split(/\s+/).filter(w => w.length > 0);
        setRopeWords(words);
        rope3d.wordOffset = 0;
        // Don't reset momentum - keep scrolling
        rope3d.firstByteStart = data.byteStart;
        rope3d.lastByteEnd = data.byteEnd;
        rope3d.viewBytePosition = data.byteStart;
        rope3d.backwardHistory = [];
        rope3d.justToggledFrames = 60; // Prevent immediate re-teleport
        
        if (rope3d.allWords.length > 0) {
          rope3d.bytesPerWord = (data.byteEnd - data.byteStart) / rope3d.allWords.length;
        }
        
        // Fade back in
        fadeCanvas(1, 100);
      });
    } else {
      // 2D mode: Update display (fade handled by CSS)
      updateUI(data);
    }
    
    state.byteStart = data.byteStart;
    state.byteEnd = data.byteEnd;
    state.nextByteStart = data.nextByteStart;
    
    // Clear history since we jumped
    navHistoryStack.length = 0;
    
    updateHash(true);
    recordNavigation(); // Log in history
  } catch (err) {
    console.error('Error jumping in same book:', err);
  }
}

function scheduleNextJump() {
  if (!jumpAround.active) return;
  
  const interval = getJumpInterval();
  jumpAround.nextJumpTime = Date.now() + interval;
  
  jumpAround.timeoutId = setTimeout(async () => {
    if (!jumpAround.active) return;
    
    // Jump based on mode
    if (jumpAround.sameBook) {
      await goToRandomLocationInSameBook();
    } else {
      await goToRandomLocation();
    }
    
    // In 3D mode only: ensure auto-read is active for smooth scrolling between jumps
    // Respect user's direction preference
    if (jumpAround.active && rope3d.active) {
      if (!autoRead.active) {
        startAutoRead();
      }
    }
    
    // Schedule next jump
    scheduleNextJump();
  }, interval);
}

function stopJumpAround() {
  jumpAround.active = false;
  jumpAround.sameBook = false;
  jumpAround.nextJumpTime = null;
  if (jumpAround.timeoutId) {
    clearTimeout(jumpAround.timeoutId);
    jumpAround.timeoutId = null;
  }
  if (jumpAround.countdownId) {
    clearInterval(jumpAround.countdownId);
    jumpAround.countdownId = null;
  }
  
  // Auto mode continues uninterrupted - user must explicitly stop it
  
  // Hide banner only if auto-read is not active
  if (!autoRead.active) {
    $('modeIndicator').classList.remove('visible');
  }
  $('modeIndicator').classList.remove('auto-only');
  $('modeIndicatorCountdown').textContent = '';
  
  // Reset momentum to stop all movement immediately
  if (rope3d.active) {
    rope3d.momentum = 0;
  }
  
  // Re-enable controls
  $('btnBack').disabled = false;
  $('btnForward').disabled = false;
  $('btnAuto').disabled = false;
  $('randomBtn').disabled = false;
  // Re-enable chunk/interval controls only in 2D mode
  if (!rope3d.active) {
    $('autoChunkSize').disabled = false;
    $('autoInterval').disabled = !autoRead.active;
  }
  $('autoDirection').disabled = false;
  $('searchToggle').disabled = false;
  $('excerptBtn').disabled = false;
  $('homeBtn').disabled = false;
}


function startGlobalJumpAround() {
  closeRandomMenu();
  startJumpAround(false); // Global mode - works in both 2D and 3D
}

function startSameBookJumpAround() {
  closeRandomMenu();
  startJumpAround(true); // Same book mode - works in both 2D and 3D
}

const navHistoryStack = [];
const $ = id => document.getElementById(id);

// ========== Network latency tracking ==========
const latencyTracker = {
  samples: [],
  maxSamples: 5,

  record(ms) {
    this.samples.push(ms);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  },

  getAverage() {
    if (this.samples.length === 0) return 500;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  },

  getP90() {
    if (this.samples.length === 0) return 1000;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.9);
    return sorted[Math.min(idx, sorted.length - 1)];
  }
};

function adjustIntervalOptions() {
  const p90 = latencyTracker.getP90();
  const minSafeInterval = Math.ceil(p90 / 1000);
  const select = $('autoInterval');

  // Mark options that might be too fast (but don't disable - let user choose)
  let adjusted = false;
  Array.from(select.options).forEach(opt => {
    const val = parseInt(opt.value, 10);
    if (val < minSafeInterval) {
      opt.textContent = opt.textContent.replace(/ \(slow\)$/, '') + ' (slow)';
      adjusted = true;
    } else {
      opt.textContent = opt.textContent.replace(/ \(slow\)$/, '');
    }
  });

  select.classList.toggle('adjusted', adjusted);
}

// ========== Auto mode management ==========

// Helper function to update the mode indicator banner
function updateModeIndicator() {
  if (jumpAround.active) {
    // Jump Around takes precedence - already handled by startJumpAround
    return;
  }
  
  if (autoRead.active) {
    const direction = $('autoDirection').value;
    const directionText = direction === 'forward' ? '→' : '←';
    $('modeIndicatorText').textContent = `Auto ${directionText} · click to stop`;
    $('modeIndicatorCountdown').textContent = '';
    $('modeIndicator').classList.add('auto-only');
    $('modeIndicator').classList.add('visible');
  } else {
    $('modeIndicator').classList.remove('visible');
    $('modeIndicator').classList.remove('auto-only');
  }
}

// Helper function for fade transitions
function fadeAndExecute(callback) {
  const content = $('content');
  content.classList.add('fading');
  
  setTimeout(() => {
    callback();
    // Remove fading class after content updates (slight delay for render)
    setTimeout(() => {
      content.classList.remove('fading');
    }, 50);
  }, 150);
}

// Helper for canvas fade (3D mode)
let canvasFadeOpacity = 1;
function fadeCanvas(targetOpacity, duration, callback) {
  const startOpacity = canvasFadeOpacity;
  const startTime = performance.now();
  
  function animate() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    canvasFadeOpacity = startOpacity + (targetOpacity - startOpacity) * progress;
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else if (callback) {
      callback();
    }
  }
  requestAnimationFrame(animate);
}

function stopAutoRead() {
  autoRead.active = false;
  if (autoRead.intervalId) {
    clearInterval(autoRead.intervalId);
    autoRead.intervalId = null;
  }
  $('btnAuto').classList.remove('active');
  $('btnAuto').textContent = '🤖';
  updateButtonStates();
  
  // Update banner - hide if Jump Around isn't active
  if (!jumpAround.active) {
    $('modeIndicator').classList.remove('visible');
    $('modeIndicator').classList.remove('auto-only');
  }
}

// Sync UI to match actual state - call this if state might be inconsistent
function syncAutoReadUI() {
  const shouldShowStop = autoRead.active;
  const buttonText = $('btnAuto').textContent;
  
  if (shouldShowStop && buttonText !== '🛑') {
    console.warn('Auto-read state mismatch: active=true but button shows auto icon. Fixing...');
    $('btnAuto').classList.add('active');
    $('btnAuto').textContent = '🛑';
  } else if (!shouldShowStop && buttonText !== '🤖') {
    console.warn('Auto-read state mismatch: active=false but button shows stop icon. Fixing...');
    $('btnAuto').classList.remove('active');
    $('btnAuto').textContent = '🤖';
    // Also clear any stray intervals
    if (autoRead.intervalId) {
      clearInterval(autoRead.intervalId);
      autoRead.intervalId = null;
    }
  }
}

function startAutoRead() {
  autoRead.active = true;
  $('btnAuto').classList.add('active');
  $('btnAuto').textContent = '🛑';
  updateButtonStates();
  
  // Show mode indicator banner (unless Jump Around is handling it)
  if (!jumpAround.active) {
    updateModeIndicator();
  }

  // In 3D mode, the animation loop handles auto-scroll
  // No timer needed - just set active flag
  if (rope3d.active) {
    return;
  }

  // 2D mode: use timer-based chunk navigation
  // Note: In 2D mode, Jump Around does NOT use auto-read, so we don't need to check jumpAround.active here
  const interval = parseInt($('autoInterval').value, 10) * 1000;
  const direction = $('autoDirection').value;
  const chunkSize = parseInt($('autoChunkSize').value, 10);

  if (chunkSize !== state.chunkSize) {
    state.chunkSize = chunkSize;
    initBook(state.bookId, state.byteStart, chunkSize, false);
  }

  autoRead.intervalId = setInterval(() => {
    // Use percent check for reliable end-of-book detection
    const currentPercent = parseFloat($('percent').textContent) || 0;
    const atEnd = direction === 'forward' && (state.nextByteStart == null || currentPercent >= 99.5);
    const atStart = direction === 'backward' && navHistoryStack.length === 0 && currentPercent <= 0.5;
    
    if (atEnd || atStart) {
      // At boundary - teleport to random location
      fadeAndExecute(() => teleportToRandomLocation());
      return;
    }
    navigate(direction);
  }, interval);
}

function restartAutoIfActive() {
  // Only relevant for 2D mode - 3D uses animation loop
  if (!autoRead.active || rope3d.active) return;
  
  clearInterval(autoRead.intervalId);
  const interval = parseInt($('autoInterval').value, 10) * 1000;
  const direction = $('autoDirection').value;
  
  // Update banner to reflect new direction (if not in Jump Around)
  if (!jumpAround.active) {
    updateModeIndicator();
  }

  autoRead.intervalId = setInterval(() => {
    // Use percent check for reliable end-of-book detection
    const currentPercent = parseFloat($('percent').textContent) || 0;
    const atEnd = direction === 'forward' && (state.nextByteStart == null || currentPercent >= 99.5);
    const atStart = direction === 'backward' && navHistoryStack.length === 0 && currentPercent <= 0.5;
    
    if (atEnd || atStart) {
      // At boundary - teleport (Jump Around shouldn't be active in 2D auto mode)
      fadeAndExecute(() => teleportToRandomLocation());
      return;
    }
    navigate(direction);
  }, interval);
}

function toggleAutoRead() {
  if (autoRead.active) {
    stopAutoRead();
  } else {
    startAutoRead();
  }
}

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

  updateHash(true); // Force immediate update after navigation
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
          const words = newText.split(/\s+/).filter(w => w.length > 0);
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
          const words = newText.split(/\s+/).filter(w => w.length > 0);
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

// ========== Error modal ==========
function showErrorModal(message) {
  $('errorMessage').textContent = message;
  $('errorOverlay').classList.add('visible');
  $('errorOkBtn').focus();
}

function closeErrorModal() {
  $('errorOverlay').classList.remove('visible');
  $('mainContent').focus();
}

$('errorClose').addEventListener('click', closeErrorModal);
$('errorOkBtn').addEventListener('click', closeErrorModal);
$('errorOverlay').addEventListener('click', (e) => {
  if (e.target === $('errorOverlay')) closeErrorModal();
});
$('errorPanel').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Enter') {
    e.preventDefault();
    closeErrorModal();
  }
});

// ========== Fullscreen ==========
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log('Fullscreen error:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

function updateFullscreenIcon() {
  const btn = $('fullscreenBtn');
  if (document.fullscreenElement) {
    btn.textContent = '⤡';
    btn.title = 'Exit fullscreen (z)';
  } else {
    btn.textContent = '⤢';
    btn.title = 'Toggle fullscreen (z)';
  }
}

$('fullscreenBtn').addEventListener('click', () => {
  toggleFullscreen();
  refocusAfterButton();
});

document.addEventListener('fullscreenchange', () => {
  updateFullscreenIcon();
  setTimeout(() => {
    resizeRopeCanvas();
    refocusAfterButton();
  }, 100);
});

// ========== Theme Selector ==========
$('themeSelect').addEventListener('change', (e) => {
  applyTheme(e.target.value);
  // Sync overflow menu theme select
  $('overflowTheme').value = e.target.value;
  refocusAfterButton();
});

// ========== Text Size Selector ==========
$('textSizeSelect').addEventListener('change', (e) => {
  applyTextSize(e.target.value);
  // Sync overflow menu text size select
  $('overflowTextSize').value = e.target.value;
  refocusAfterButton();
});

// ========== Overflow Menu ==========
function closeOverflowMenu() {
  $('overflowMenu').classList.remove('visible');
}

$('overflowBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('overflowMenu').classList.toggle('visible');
});

// Close overflow menu when clicking outside
document.addEventListener('click', (e) => {
  if (!$('overflowBtn').contains(e.target) && !$('overflowMenu').contains(e.target)) {
    closeOverflowMenu();
  }
});

// Overflow menu actions
$('overflowExcerpt').addEventListener('click', () => {
  closeOverflowMenu();
  openExcerptView();
});

$('overflowRandom').addEventListener('click', () => {
  closeOverflowMenu();
  openRandomMenu();
});

$('overflowBookmark').addEventListener('click', () => {
  closeOverflowMenu();
  openBookmarkModal();
});

$('overflowMode').addEventListener('click', () => {
  closeOverflowMenu();
  toggleRopeMode();
});

$('overflowFullscreen').addEventListener('click', () => {
  closeOverflowMenu();
  toggleFullscreen();
});

$('overflowP2P').addEventListener('click', () => {
  closeOverflowMenu();
  toggleP2PPanel();
});

$('overflowDebug').addEventListener('click', () => {
  closeOverflowMenu();
  toggleDebug();
});

// Overflow theme select - sync with main select
$('overflowTheme').addEventListener('change', (e) => {
  $('themeSelect').value = e.target.value;
  applyTheme(e.target.value);
});

// Overflow text size select - sync with main select
$('overflowTextSize').addEventListener('change', (e) => {
  $('textSizeSelect').value = e.target.value;
  applyTextSize(e.target.value);
});

// Initialize overflow selects to match main selects
function syncOverflowSelects() {
  $('overflowTheme').value = $('themeSelect').value;
  $('overflowTextSize').value = $('textSizeSelect').value;
}

// ========== Book Info Button (? icon) ==========
// Toggle popup on click for mobile users
$('bookInfoBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const btn = $('bookInfoBtn');
  const isActive = btn.classList.toggle('active');
  // If activating, set up one-time blur listener to close
  if (isActive) {
    const closeOnBlur = () => {
      btn.classList.remove('active');
      btn.removeEventListener('blur', closeOnBlur);
    };
    btn.addEventListener('blur', closeOnBlur);
  }
});

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
        const words = newText.split(/\s+/).filter(w => w.length > 0);
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

// ========== Event handlers ==========
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  const key = e.key.toLowerCase();
  const cfg = rope3d.config;
  
  // Check if a modal is open - let modal handlers handle their own keys
  const randomMenuOpen = $('randomOverlay').classList.contains('visible');
  const bookmarkModalOpen = $('bookmarkOverlay').classList.contains('visible');
  const searchModalOpen = $('searchOverlay')?.classList.contains('visible');
  const modalOpen = randomMenuOpen || bookmarkModalOpen || searchModalOpen;

  // Handle special keys with switch statement
  switch (e.key) {
    case 'Escape':
      // Escape stops Jump Around if active, then auto mode, otherwise closes modals
      if (jumpAround.active) {
        e.preventDefault();
        stopJumpAround();
        // Auto mode continues uninterrupted
        return;
      }
      if (autoRead.active) {
        e.preventDefault();
        stopAutoRead();
        return;
      }
      // Let other handlers deal with closing modals
      break;
  }

  // J key: stop Jump Around if active, otherwise start same-book Jump Around
  // But skip if a modal is open - let the modal handle it
  if (key === 'j' && !modalOpen) {
    e.preventDefault();
    if (jumpAround.active) {
      stopJumpAround();
      // Auto mode continues uninterrupted
    } else {
      // Start same-book Jump Around (works in both 2D and 3D)
      startJumpAround(true);
    }
    return;
  }

  // Toggle 3D mode
  if (key === '3') {
    e.preventDefault();
    toggleRopeMode();
    return;
  }

  // Switch to 2D mode (when in 3D)
  if (key === '2' && rope3d.active) {
    e.preventDefault();
    toggleRopeMode();
    return;
  }

  // Toggle auto direction
  if (key === 'x') {
    e.preventDefault();
    const dir = $('autoDirection');
    dir.value = dir.value === 'forward' ? 'backward' : 'forward';
    showHint(`Direction: ${dir.value}`, 800);
    // Update banner and restart auto if active
    if (autoRead.active && !jumpAround.active) {
      updateModeIndicator();
      restartAutoIfActive();
    }
    return;
  }

  // Open random menu (works in both 2D and 3D mode)
  if (key === 'r') {
    e.preventDefault();
    openRandomMenu();
    return;
  }

  // Open bookmarks modal
  if (key === 'b') {
    e.preventDefault();
    openBookmarkModal();
    return;
  }

  // Toggle fullscreen (z)
  if (key === 'z') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

  // Cycle theme (Shift+T)
  if (key === 't' && e.shiftKey) {
    e.preventDefault();
    cycleTheme();
    return;
  }

  // Cycle text size (Shift+A) - only in reading mode
  if (key === 'a' && e.shiftKey && !rope3d.active) {
    e.preventDefault();
    cycleTextSize();
    return;
  }

  // Reset camera view in 3D mode (use 'v' for view reset)
  if (key === 'v' && rope3d.active) {
    e.preventDefault();
    resetCameraView();
    return;
  }

  // Shift+arrows = rotate camera in 3D mode
  if (e.shiftKey && rope3d.active) {
    if (key === 'arrowup' || key === 'w') {
      e.preventDefault();
      rope3d.cameraPitch = Math.max(-cfg.MAX_PITCH, rope3d.cameraPitch - 0.05);
      return;
    }
    if (key === 'arrowdown' || key === 's') {
      e.preventDefault();
      rope3d.cameraPitch = Math.min(cfg.MAX_PITCH, rope3d.cameraPitch + 0.05);
      return;
    }
    if (key === 'arrowleft' || key === 'a') {
      e.preventDefault();
      rope3d.cameraYaw = Math.max(-cfg.MAX_YAW, rope3d.cameraYaw - 0.05);
      return;
    }
    if (key === 'arrowright' || key === 'd') {
      e.preventDefault();
      rope3d.cameraYaw = Math.min(cfg.MAX_YAW, rope3d.cameraYaw + 0.05);
      return;
    }
  }

  if (key === 'arrowup' || key === 'arrowright' || key === 'w' || key === 'd') {
    e.preventDefault();
    // Ignore manual navigation during auto mode
    if (autoRead.active) return;
    if (rope3d.active) {
      rope3d.momentum += getManualMomentum();
    } else {
      navigate('forward');
    }
    return;
  }

  if (key === 'arrowdown' || key === 'arrowleft' || key === 's' || key === 'a') {
    e.preventDefault();
    // Ignore manual navigation during auto mode
    if (autoRead.active) return;
    if (rope3d.active) {
      rope3d.momentum -= getManualMomentum();
    } else {
      navigate('backward');
    }
    return;
  }

  if (key === 'pagedown') {
    e.preventDefault();
    // Ignore manual navigation during auto mode
    if (autoRead.active) return;
    if (rope3d.active) {
      rope3d.momentum += getManualMomentum() * 5;
    }
    return;
  }

  if (key === 'pageup') {
    e.preventDefault();
    // Ignore manual navigation during auto mode
    if (autoRead.active) return;
    if (rope3d.active) {
      rope3d.momentum -= getManualMomentum() * 5;
    }
    return;
  }

  if (key === ' ') {
    e.preventDefault();
    toggleAutoRead();
    return;
  }

  if (key === '/') {
    e.preventDefault();
    // Don't stop auto-read - let animation continue while searching
    openSearch();
    return;
  }
});

// Helper to return focus to appropriate element after button click
function refocusAfterButton() {
  if (rope3d.active) {
    rope3d.canvas.focus();
  } else {
    $('mainContent').focus();
  }
}

// Hold-to-continue navigation for buttons
function setupHoldToNavigate(btn, direction, blockOtherHandlers = false) {
  let holdInterval = null;
  let holdTimeout = null;
  const HOLD_DELAY = 300; // ms before hold kicks in
  const REPEAT_INTERVAL = 150; // ms between repeats while holding
  
  function doNavigate() {
    if (btn.disabled) return;
    if (rope3d.active) {
      rope3d.momentum += direction === 'forward' ? getManualMomentum() : -getManualMomentum();
    } else {
      navigate(direction);
    }
  }
  
  function startHold(e) {
    if (btn.disabled) return;
    e.preventDefault();
    if (blockOtherHandlers) e.stopImmediatePropagation();
    doNavigate(); // immediate first action
    holdTimeout = setTimeout(() => {
      holdInterval = setInterval(doNavigate, REPEAT_INTERVAL);
    }, HOLD_DELAY);
  }
  
  function stopHold(e) {
    if (blockOtherHandlers && e) e.stopImmediatePropagation();
    if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null; }
    if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
    refocusAfterButton();
  }
  
  const captureOpts = blockOtherHandlers ? { capture: true } : false;
  const touchCaptureOpts = blockOtherHandlers ? { capture: true, passive: false } : { passive: false };
  
  btn.addEventListener('mousedown', startHold, captureOpts);
  btn.addEventListener('touchstart', startHold, touchCaptureOpts);
  btn.addEventListener('mouseup', stopHold, captureOpts);
  btn.addEventListener('mouseleave', stopHold, captureOpts);
  btn.addEventListener('touchend', stopHold, captureOpts);
  btn.addEventListener('touchcancel', stopHold, captureOpts);
  
  // Block click for mobile buttons to prevent original handlers
  if (blockOtherHandlers) {
    btn.addEventListener('click', (e) => e.stopImmediatePropagation(), { capture: true });
  }
}

setupHoldToNavigate($('btnBack'), 'backward');
setupHoldToNavigate($('btnForward'), 'forward');

// Mobile nav buttons - reuse same hold logic, block original P2P/debug handlers
const mobileBack = $('p2pToggle');
const mobileForward = $('debugToggle');
if (mobileBack && mobileBack.dataset.mobileNav === 'back') {
  setupHoldToNavigate(mobileBack, 'backward', true);
}
if (mobileForward && mobileForward.dataset.mobileNav === 'forward') {
  setupHoldToNavigate(mobileForward, 'forward', true);
}

$('btnAuto').addEventListener('click', (e) => { 
  e.target.blur();
  toggleAutoRead(); 
  refocusAfterButton(); 
});
$('randomBtn').addEventListener('click', (e) => {
  e.target.blur();
  openRandomMenu();
});

// Click indicator banner to stop active mode (Jump Around or Auto)
$('modeIndicator').addEventListener('click', () => {
  if (jumpAround.active) {
    stopJumpAround();
  }
  if (autoRead.active) {
    stopAutoRead();
  }
});

// Mobile: tap book ID to see title/author
$('titleBarTitle').addEventListener('click', () => {
  if (window.innerWidth > 768) return; // Only on mobile
  if (state.bookTitle || state.bookAuthor) {
    const parts = [];
    if (state.bookTitle) parts.push(state.bookTitle);
    if (state.bookAuthor) parts.push(`by ${state.bookAuthor}`);
    showHint(parts.join(' — '), 3000);
  }
});

// Click on main content to restore keyboard focus
$('mainContent').addEventListener('click', () => $('mainContent').focus());

// Wheel navigation in 2D mode - scroll past boundaries to navigate
(function() {
  let wheelAccumulator = 0;
  const WHEEL_THRESHOLD = 150; // Accumulated delta before triggering nav
  let lastWheelTime = 0;
  const WHEEL_RESET_MS = 300; // Reset accumulator after this idle time
  
  $('mainContent').addEventListener('wheel', (e) => {
    // Only in 2D mode
    if (rope3d.active) return;
    
    const main = $('mainContent');
    const atTop = main.scrollTop <= 0;
    const atBottom = main.scrollTop + main.clientHeight >= main.scrollHeight - 1;
    
    // Reset accumulator if idle too long
    const now = Date.now();
    if (now - lastWheelTime > WHEEL_RESET_MS) {
      wheelAccumulator = 0;
    }
    lastWheelTime = now;
    
    // Scrolling down at bottom -> forward
    if (e.deltaY > 0 && atBottom) {
      e.preventDefault();
      wheelAccumulator += e.deltaY;
      if (wheelAccumulator >= WHEEL_THRESHOLD) {
        wheelAccumulator = 0;
        navigate('forward');
      }
      return;
    }
    
    // Scrolling up at top -> backward
    if (e.deltaY < 0 && atTop) {
      e.preventDefault();
      wheelAccumulator += e.deltaY; // negative
      if (wheelAccumulator <= -WHEEL_THRESHOLD) {
        wheelAccumulator = 0;
        navigate('backward');
      }
      return;
    }
    
    // Not at boundary or wrong direction - reset
    wheelAccumulator = 0;
  }, { passive: false });
})();

// Custom chunk sizes from localStorage
const CUSTOM_CHUNK_KEY = 'gutex_custom_chunks';

function loadCustomChunks() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_CHUNK_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCustomChunk(size) {
  const chunks = loadCustomChunks();
  if (!chunks.includes(size)) {
    chunks.push(size);
    chunks.sort((a, b) => a - b);
    localStorage.setItem(CUSTOM_CHUNK_KEY, JSON.stringify(chunks));
  }
}

function populateCustomChunks() {
  const select = $('autoChunkSize');
  const customOptIdx = Array.from(select.options).findIndex(o => o.value === 'custom');
  if (customOptIdx < 0) return;
  
  // Remove any existing custom options (between last standard and 'custom')
  const standardVals = ['1','2','3','5','8','10','50','100','150','175','200','250','300','400','500'];
  Array.from(select.options).forEach(opt => {
    if (!standardVals.includes(opt.value) && opt.value !== 'custom') {
      opt.remove();
    }
  });
  
  // Re-get the custom option index after removals
  const customOpt = Array.from(select.options).find(o => o.value === 'custom');
  
  // Insert custom sizes before the 'Custom...' option
  const customChunks = loadCustomChunks();
  customChunks.forEach(size => {
    if (!standardVals.includes(String(size))) {
      const opt = document.createElement('option');
      opt.value = size;
      opt.textContent = `${size}w ★`;
      select.insertBefore(opt, customOpt);
    }
  });
}

// Initialize custom chunks on load
populateCustomChunks();

$('autoChunkSize').addEventListener('change', (e) => {
  const val = e.target.value;
  
  // Handle custom option
  if (val === 'custom') {
    const input = prompt('Enter custom chunk size (words):', '225');
    if (input) {
      const size = parseInt(input, 10);
      if (size > 0 && size <= 2000) {
        saveCustomChunk(size);
        populateCustomChunks();
        e.target.value = String(size);
        
        if (state.bookId) {
          state.chunkSize = size;
          updateHash(true);
          if (rope3d.active) {
            reloadRopeWithChunkSize(size);
          } else {
            initBook(state.bookId, state.byteStart, size, false);
          }
        }
      } else {
        showHint('Invalid chunk size (1-2000)');
        e.target.value = String(state.chunkSize);
      }
    } else {
      e.target.value = String(state.chunkSize);
    }
    refocusAfterButton();
    return;
  }
  
  e.target.blur();
  // Auto mode continues uninterrupted
  if (state.bookId) {
    const newChunkSize = parseInt(val, 10);
    if (newChunkSize !== state.chunkSize) {
      state.chunkSize = newChunkSize;
      updateHash(true);
      
      if (rope3d.active) {
        // In 3D mode: reload rope with new chunk size
        reloadRopeWithChunkSize(newChunkSize);
      } else {
        initBook(state.bookId, state.byteStart, newChunkSize, false);
      }
    }
  }
  refocusAfterButton();
});

$('autoInterval').addEventListener('change', (e) => {
  e.target.blur();
  restartAutoIfActive();
  refocusAfterButton();
});

$('autoDirection').addEventListener('change', (e) => {
  e.target.blur();
  // Always update the banner when direction changes
  if (autoRead.active && !jumpAround.active) {
    updateModeIndicator();
  }
  restartAutoIfActive();
  refocusAfterButton();
});

window.addEventListener('hashchange', async () => {
  // Auto mode continues uninterrupted
  const params = parseHash();
  if (params) {
    // Check if mode switch is needed
    const targetMode = params.mode || '2d';
    const wasIn3D = rope3d.active;
    const willBe3D = targetMode === '3d';
    const needsModeSwitch = willBe3D !== wasIn3D;
    
    // In 3D mode, start a fade out before loading
    if (wasIn3D) {
      fadeCanvas(0.3, 100);
    }
    
    const data = await initBook(params.bookId, params.byteStart, params.chunkSize);
    
    // Only switch mode if content loaded successfully
    if (data && needsModeSwitch) {
      toggleRopeMode();
    }
    
    // Sync 3D mode if we end up in 3D (either stayed in 3D or switched to it)
    if (rope3d.active && data) {
      // Successful load - sync from returned data
      const newText = data.formattedText || data.words.join(' ');
      const words = newText.split(/\s+/).filter(w => w.length > 0);
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
      
      // Fade back in
      fadeCanvas(1, 100);
    } else if (rope3d.active && !data) {
      // initBook failed but we're in 3D - sync from whatever content is there
      syncRopeFromContent();
      fadeCanvas(1, 100);
    }
  }
});

// ========== Debug panel ==========
const debug = {
  active: false,
  pollInterval: null,
  currentTab: 'events',
  clearTimestamps: { events: 0, requests: 0, mirrors: 0, p2p: 0 },
  p2pEvents: [] // Client-side P2P event log
};

// Log P2P events to debug panel (client-side only)
function p2pLog(type, message) {
  const entry = {
    timestamp: Date.now(),
    type: type,
    message: message
  };
  debug.p2pEvents.push(entry);
  // Keep last 100 events
  if (debug.p2pEvents.length > 100) {
    debug.p2pEvents.shift();
  }
  // Update display if P2P tab is active
  if (debug.active && debug.currentTab === 'p2p') {
    renderP2PDebug();
  }
}

function renderP2PDebug() {
  const filtered = debug.p2pEvents.filter(e => e.timestamp > debug.clearTimestamps.p2p);
  
  // Build status header
  const statusHtml = `
    <div style="background:#1a1a2e;padding:10px 12px;border-bottom:1px solid #333;font-size:12px;">
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <span style="color:#888;">Room: <span style="color:${p2p.roomId ? '#4ade80' : '#666'}">${p2p.roomId || 'None'}</span></span>
        <span style="color:#888;">Peers: <span style="color:#0af">${p2p.peers.size}</span></span>
        <span style="color:#888;">WS: <span style="color:${p2p.ws?.readyState === 1 ? '#4ade80' : '#f66'}">${p2p.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][p2p.ws.readyState] : 'NULL'}</span></span>
      </div>
      ${p2p.peers.size > 0 ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #333;">
          <span style="color:#666;font-size:10px;text-transform:uppercase;">Peers:</span>
          ${Array.from(p2p.peers.values()).map(peer => `
            <span style="display:inline-block;margin:2px 4px;padding:2px 8px;background:#252540;border-radius:10px;font-size:11px;">
              ${escapeHtml(peer.displayName)}${peer.id === p2p.peerId ? ' (you)' : ''}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  const eventsHtml = filtered.map(e => {
    const time = new Date(e.timestamp).toLocaleTimeString();
    return `
      <div class="debug-entry">
        <span class="time">${time}</span>
        <span class="type ${e.type}">${e.type.toUpperCase().replace('P2P_', '')}</span>
        <span class="message">${escapeHtml(e.message)}</span>
      </div>
    `;
  }).join('');
  
  $('debugP2P').innerHTML = statusHtml + (eventsHtml || '<div style="color:#666;padding:20px;">No P2P events yet</div>');
}

function toggleDebug() {
  debug.active = !debug.active;
  $('debugPanel').classList.toggle('visible', debug.active);
  $('debugToggle').classList.toggle('active', debug.active);
  document.body.classList.toggle('debug-open', debug.active);
  $('debugStatus').textContent = debug.active ? 'Live' : 'Paused';

  if (debug.active) {
    pollDebug();
    debug.pollInterval = setInterval(pollDebug, 1000);
  } else {
    if (debug.pollInterval) {
      clearInterval(debug.pollInterval);
      debug.pollInterval = null;
    }
  }
}

async function pollDebug() {
  if (!debug.active) return;

  try {
    const res = await fetch('/api/debug');
    const data = await res.json();

    // Render events tab
    if (data.events) {
      const filtered = data.events.filter(e => e.timestamp > debug.clearTimestamps.events);
      const eventsHtml = filtered.map(e => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        const duration = e.duration !== null ? `${Math.round(e.duration)}ms` : '';
        return `
          <div class="debug-entry">
            <span class="time">${time}</span>
            <span class="type ${e.type}">${e.type.toUpperCase()}</span>
            <span class="message">${escapeHtml(e.message)}</span>
            <span class="duration">${duration}</span>
          </div>
        `;
      }).join('');
      $('debugEvents').innerHTML = eventsHtml || '<div style="color:#666;padding:20px;">No events yet</div>';
    }

    // Render requests tab - now includes mirror info
    if (data.requests) {
      const filtered = data.requests.filter(r => r.timestamp > debug.clearTimestamps.requests);
      const reqHtml = filtered.map(r => {
        const time = new Date(r.timestamp).toLocaleTimeString();
        const bytes = (r.bytes / 1024).toFixed(1);
        const mirrorInfo = r.mirror ? ` via ${r.mirror}` : '';
        return `
          <div class="debug-entry">
            <span class="time">${time}</span>
            <span class="type get">GET</span>
            <span class="message">Book ${r.bookId} bytes ${r.start.toLocaleString()}–${r.end.toLocaleString()} (${bytes}KB)${mirrorInfo}</span>
            <span class="duration">${r.duration}ms</span>
          </div>
        `;
      }).join('');
      $('debugRequests').innerHTML = reqHtml || '<div style="color:#666;padding:20px;">No requests yet</div>';
    }

    // Render mirrors tab
    try {
      const mirrorsRes = await fetch('/api/mirrors');
      const mirrorsData = await mirrorsRes.json();

      if (mirrorsData.mirrors) {
        const mirrorsHtml = mirrorsData.mirrors.map((m, idx) => {
          const stats = m.stats || {};
          const total = (stats.successes || 0) + (stats.failures || 0);
          const successRate = total > 0 ? Math.round((stats.successes / total) * 100) : '-';
          const avgTime = stats.avgResponseTime ? Math.round(stats.avgResponseTime) + 'ms' : '-';
          const statusColor = total === 0 ? '#666' : (successRate >= 80 ? '#0f0' : successRate >= 50 ? '#fa0' : '#f00');

          return `
            <div class="debug-entry">
              <span class="time" style="min-width:30px">#${idx + 1}</span>
              <span class="type" style="color:${statusColor};min-width:40px">${successRate}%</span>
              <span class="message">${escapeHtml(m.provider)} (${escapeHtml(m.location)})</span>
              <span class="duration">${avgTime}</span>
            </div>
          `;
        }).join('');
        $('debugMirrors').innerHTML = `
          <div style="color:#0ff;padding:4px 0;border-bottom:1px solid #333;margin-bottom:4px">
            ${mirrorsData.mirrorCount} mirrors available
          </div>
          ${mirrorsHtml}
        `;
      }
    } catch (mirrorErr) {
      $('debugMirrors').innerHTML = '<div style="color:#666;padding:20px;">Could not fetch mirror status</div>';
    }

    // Render P2P tab (client-side data, no fetch needed)
    renderP2PDebug();
  } catch (err) {
    // Silent fail for debug polling
  }
}

// Debug tab switching
document.querySelectorAll('.debug-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const tabName = tab.dataset.tab;
    debug.currentTab = tabName;

    document.querySelectorAll('.debug-content').forEach(c => c.style.display = 'none');
    document.querySelector(`.debug-content[data-tab="${tabName}"]`).style.display = 'block';
  });
});

$('debugToggle').addEventListener('click', toggleDebug);

// Clear current debug tab
$('debugClear').addEventListener('click', () => {
  const tabName = debug.currentTab;
  debug.clearTimestamps[tabName] = Date.now();
  const content = document.querySelector(`.debug-content[data-tab="${tabName}"]`);
  if (content) {
    content.innerHTML = '<div style="color:#666;padding:20px;">Cleared</div>';
  }
});

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
    const words = newText.split(/\s+/).filter(w => w.length > 0);
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

// ========== Color Utility for Themes ==========
function parseColorToRgb(color) {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  // Handle rgb/rgba
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
  }
  // Default to black
  return { r: 0, g: 0, b: 0 };
}

// ========== 3D Rope Mode ==========
const rope3d = {
  active: false,
  canvas: null,
  ctx: null,
  allWords: [],        // All loaded words
  wordItalicMap: [],   // Track which words should be italic (computed from underscore markers)
  wordOffset: 0,       // Current word position (float for smooth scroll)
  momentum: 0,
  isDragging: false,
  isRotating: false,   // True when rotating camera (left click drag or shift+arrows)
  justToggledFrames: 0, // Prevent teleportation for first few frames after toggle
  lastX: 0,
  lastY: 0,
  lastTime: 0,
  animationId: null,
  lastFrameTime: 0,    // For delta time calculation
  // Camera rotation (Euler angles in radians)
  cameraPitch: 0,      // Up/down rotation
  cameraYaw: 0,        // Left/right rotation
  // Byte position tracking for URL updates and backward loading
  firstByteStart: 0,   // Byte position of first word in allWords
  lastByteEnd: 0,      // Byte position of end of loaded content (for forward tracking)
  bytesPerWord: 6,     // Approximate bytes per word (updated dynamically)
  viewBytePosition: 0, // Actual byte position being viewed (independent of word index)
  lastWordOffset: 0,   // Previous wordOffset for calculating byte movement
  backwardHistory: [], // Stack of previous byte positions for backward loading
  
  // Configuration - smooth flowing path
  config: {
    WORD_SPACING: 300,         // Distance between consecutive words along spline
    
    // Primary sweeping curves (medium wavelength for visible motion)
    CURVE_AMPLITUDE_X: 600,    // Wide horizontal sweeps
    CURVE_AMPLITUDE_Y: 400,    // Big vertical hills
    CURVE_PERIOD_X: 25,        // 25 words per horizontal sweep - visible!
    CURVE_PERIOD_Y: 18,        // 18 words per vertical wave - hills!
    
    // Secondary curves (adds banking and variation)
    CURVE2_AMPLITUDE_X: 250,
    CURVE2_AMPLITUDE_Y: 200,
    CURVE2_PERIOD_X: 40,
    CURVE2_PERIOD_Y: 30,
    
    // Loop-de-loop parameters
    LOOP_AMPLITUDE: 350,       // Size of loops
    LOOP_PERIOD: 60,           // Words between loop sections
    LOOP_TIGHTNESS: 8,         // Words per loop revolution - tight!
    LOOP_VERTICAL_SCALE: 0.8,  // Make loops slightly elliptical
    
    CAMERA_LOOK_BEHIND: 2.5,   // Camera sits this many words behind current
    CAMERA_LOOK_AHEAD: 4,      // Camera looks at point this many words ahead of itself
    CAMERA_HEIGHT: 80,         // Camera floats this much above the spline
    FOV: 500,
    FOV_MIN: 200,              // Zoomed in
    FOV_MAX: 1200,             // Zoomed out
    NEAR_CLIP: 20,
    FAR_CLIP: 3000,
    BASE_FONT_SIZE: 42,
    MIN_FONT_SIZE: 6,
    SCROLL_SPEED: 0.015,       // Manual scroll sensitivity
    ROTATION_SPEED: 0.003,     // Camera rotation sensitivity
    MOMENTUM_DECAY: 0.95,      // Slower decay for smoother glide
    PREFETCH_THRESHOLD: 30,
    BACKWARD_PREFETCH_THRESHOLD: 30, // Load backward when this close to start - same as forward!
    SHOW_CONNECTOR: true,
    CONNECTOR_OPACITY: 0.15,
    // Auto-scroll speeds (words per second)
    AUTO_SPEED_MIN: 0.2,       // Slowest auto-scroll
    AUTO_SPEED_MAX: 5.0,       // Fastest auto-scroll
    AUTO_SPEED_DEFAULT: 1.0,   // Default - comfortable reading
    // Rotation limits (radians)
    MAX_PITCH: Math.PI / 3,    // 60 degrees up/down
    MAX_YAW: Math.PI / 2,      // 90 degrees left/right
  }
};

// Roller coaster spline: sweeping curves with loop-de-loops
// Butter smooth, zero gravity gliding
function ropePathPosition(t) {
  const cfg = rope3d.config;
  
  // Primary curves - big sweeping hills and turns
  const theta1X = (t / cfg.CURVE_PERIOD_X) * Math.PI * 2;
  const theta1Y = (t / cfg.CURVE_PERIOD_Y) * Math.PI * 2;
  
  // Secondary curves - adds variety and banking
  const theta2X = (t / cfg.CURVE2_PERIOD_X) * Math.PI * 2;
  const theta2Y = (t / cfg.CURVE2_PERIOD_Y) * Math.PI * 2;
  
  // Base roller coaster track
  let x = Math.sin(theta1X) * cfg.CURVE_AMPLITUDE_X +
          Math.sin(theta2X) * cfg.CURVE2_AMPLITUDE_X;
  let y = Math.sin(theta1Y) * cfg.CURVE_AMPLITUDE_Y +
          Math.cos(theta2Y) * cfg.CURVE2_AMPLITUDE_Y;  // cos for phase offset
  
  // Loop-de-loops: smoothly activated loops
  const loopPhase = (t / cfg.LOOP_PERIOD) * Math.PI * 2;
  // Smooth activation: sin^6 gives nice smooth bumps
  const loopActivation = Math.pow(Math.max(0, Math.sin(loopPhase)), 6);
  
  if (loopActivation > 0.001) {
    const loopT = (t / cfg.LOOP_TIGHTNESS) * Math.PI * 2;
    // Actual loop: x goes in circle, y goes in circle
    x += Math.sin(loopT) * cfg.LOOP_AMPLITUDE * loopActivation;
    y += (Math.cos(loopT) - 1) * cfg.LOOP_AMPLITUDE * cfg.LOOP_VERTICAL_SCALE * loopActivation;
  }
  
  return {
    x: x,
    y: y,
    z: t * cfg.WORD_SPACING
  };
}

// Compute camera frame: position, forward, right, up vectors
// Applies user rotation (pitch/yaw) on top of spline-following base orientation
function computeCameraFrame(wordOffset) {
  const cfg = rope3d.config;
  
  // Camera is positioned slightly behind the current word
  const camT = wordOffset - cfg.CAMERA_LOOK_BEHIND;
  const camPosOnSpline = ropePathPosition(camT);
  
  // Lift camera above the spline for god's eye view
  const camPos = {
    x: camPosOnSpline.x,
    y: camPosOnSpline.y + cfg.CAMERA_HEIGHT,
    z: camPosOnSpline.z
  };
  
  // Camera looks at a point ahead on the spline (not lifted)
  const lookT = camT + cfg.CAMERA_LOOK_AHEAD;
  const lookPos = ropePathPosition(lookT);
  
  // Base forward vector (normalized direction camera is looking)
  let fx = lookPos.x - camPos.x;
  let fy = lookPos.y - camPos.y;
  let fz = lookPos.z - camPos.z;
  const fLen = Math.sqrt(fx*fx + fy*fy + fz*fz);
  fx /= fLen; fy /= fLen; fz /= fLen;
  
  // World up reference (we'll orthogonalize)
  let upX = 0, upY = 1, upZ = 0;
  
  // Right vector = forward × up
  let rx = fy * upZ - fz * upY;
  let ry = fz * upX - fx * upZ;
  let rz = fx * upY - fy * upX;
  const rLen = Math.sqrt(rx*rx + ry*ry + rz*rz);
  rx /= rLen; ry /= rLen; rz /= rLen;
  
  // Recompute up = right × forward (orthogonal to both)
  upX = ry * fz - rz * fy;
  upY = rz * fx - rx * fz;
  upZ = rx * fy - ry * fx;
  
  // Apply user rotation (yaw around up, then pitch around right)
  const yaw = rope3d.cameraYaw;
  const pitch = rope3d.cameraPitch;
  
  if (Math.abs(yaw) > 0.001 || Math.abs(pitch) > 0.001) {
    // Yaw rotation (around up axis)
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    
    // Rotate forward and right around up
    let fx2 = fx * cosY + rx * sinY;
    let fy2 = fy;
    let fz2 = fz * cosY + rz * sinY;
    
    let rx2 = rx * cosY - fx * sinY;
    let ry2 = ry;
    let rz2 = rz * cosY - fz * sinY;
    
    // Pitch rotation (around right axis)
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    
    // Rotate forward and up around right
    fx = fx2 * cosP - upX * sinP;
    fy = fy2 * cosP - upY * sinP;
    fz = fz2 * cosP - upZ * sinP;
    
    upX = upX * cosP + fx2 * sinP;
    upY = upY * cosP + fy2 * sinP;
    upZ = upZ * cosP + fz2 * sinP;
    
    rx = rx2; ry = ry2; rz = rz2;
  }
  
  return {
    pos: camPos,
    forward: { x: fx, y: fy, z: fz },
    right: { x: rx, y: ry, z: rz },
    up: { x: upX, y: upY, z: upZ }
  };
}

// Transform world position to camera space and project to screen
function projectToCameraSpace(worldPos, camFrame, W, H) {
  const cfg = rope3d.config;
  
  // Vector from camera to point
  const dx = worldPos.x - camFrame.pos.x;
  const dy = worldPos.y - camFrame.pos.y;
  const dz = worldPos.z - camFrame.pos.z;
  
  // Transform to camera space (dot products with camera axes)
  const camX = dx * camFrame.right.x + dy * camFrame.right.y + dz * camFrame.right.z;
  const camY = dx * camFrame.up.x + dy * camFrame.up.y + dz * camFrame.up.z;
  const camZ = dx * camFrame.forward.x + dy * camFrame.forward.y + dz * camFrame.forward.z;
  
  // Point is behind camera
  if (camZ <= 0) return null;
  
  // Perspective projection with fixed FOV
  const scale = cfg.FOV / camZ;
  
  return {
    screenX: camX * scale + W / 2,
    screenY: -camY * scale + H / 2,  // Flip Y for screen coords
    scale,
    depth: camZ
  };
}

// Smooth opacity curve
function ropeOpacity(depth) {
  const cfg = rope3d.config;
  if (depth < cfg.NEAR_CLIP || depth > cfg.FAR_CLIP) return 0;
  
  const range = cfg.FAR_CLIP - cfg.NEAR_CLIP;
  const t = (depth - cfg.NEAR_CLIP) / range;
  
  // Fade in quickly, fade out gradually
  const fadeIn = Math.min(1, (depth - cfg.NEAR_CLIP) / 100);
  const fadeOut = Math.pow(1 - t, 0.5);
  
  return Math.max(0, Math.min(1, fadeIn * fadeOut));
}

function initRope3D() {
  rope3d.canvas = $('canvas3d');
  rope3d.ctx = rope3d.canvas.getContext('2d');
  
  resizeRopeCanvas();
  window.addEventListener('resize', resizeRopeCanvas);
  
  rope3d.canvas.addEventListener('wheel', handleRopeWheel, { passive: false });
  rope3d.canvas.addEventListener('pointerdown', handleRopePointerDown);
  rope3d.canvas.addEventListener('pointermove', handleRopePointerMove);
  rope3d.canvas.addEventListener('pointerup', handleRopePointerUp);
  rope3d.canvas.addEventListener('pointercancel', handleRopePointerUp);
}

function resizeRopeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  rope3d.canvas.width = window.innerWidth * dpr;
  rope3d.canvas.height = window.innerHeight * dpr;
  rope3d.canvas.style.width = window.innerWidth + 'px';
  rope3d.canvas.style.height = window.innerHeight + 'px';
}

function toggleRopeMode() {
  rope3d.active = !rope3d.active;
  
  // Stop Jump Around on any mode toggle for predictable behavior
  if (jumpAround.active) {
    stopJumpAround();
  }
  
  if (rope3d.active) {
    // Entering 3D mode
    // If 2D auto-read was running, keep autoRead.active true but clear the interval
    // (3D uses animation loop for auto-scroll, not setInterval)
    if (autoRead.active && autoRead.intervalId) {
      clearInterval(autoRead.intervalId);
      autoRead.intervalId = null;
      // Auto-scroll continues via the 3D animation loop
    }
    
    document.body.classList.add('mode-3d');
    rope3d.canvas.classList.add('visible');
    $('modeToggle').textContent = '📖';
    $('autoChunkSize').disabled = true;
    $('autoInterval').disabled = true;
    
    // Reset camera rotation
    rope3d.cameraPitch = 0;
    rope3d.cameraYaw = 0;
    
    // Prevent teleportation for the first 30 frames after toggling
    // This prevents accidental teleportation when state isn't fully initialized
    rope3d.justToggledFrames = 30;
    
    // Use EXACTLY the words from 2D view - no reload, no fetch
    // The 2D content is the source of truth
    // Note: When switching from 2D to 3D, italic markers may have already been processed
    // into HTML tags, so we use setRopeWords to process any remaining markers
    const content = $('content').textContent || '';
    const words = content.split(/\s+/).filter(w => w.length > 0);
    setRopeWords(words);
    rope3d.wordOffset = 0;
    rope3d.lastWordOffset = 0;
    rope3d.momentum = 0;
    
    // Track byte position for URL updates
    rope3d.firstByteStart = state.byteStart || 0;
    rope3d.lastByteEnd = state.byteEnd || 0;
    rope3d.viewBytePosition = state.byteStart || 0; // Actual byte position being viewed
    rope3d.backwardHistory = [...navHistoryStack]; // Copy current history for backward nav
    
    // Calculate bytes per word for this chunk
    if (rope3d.allWords.length > 0 && state.byteEnd > state.byteStart) {
      rope3d.bytesPerWord = (state.byteEnd - state.byteStart) / rope3d.allWords.length;
    }
    
    startRopeAnimation();
    
    // Update URL to reflect 3D mode
    updateHash(true);
  } else {
    document.body.classList.remove('mode-3d');
    rope3d.canvas.classList.remove('visible');
    $('modeToggle').textContent = '📹';
    $('autoChunkSize').disabled = false;
    $('autoInterval').disabled = !autoRead.active;
    
    // Update 2D view to match current 3D position before switching
    updateRopeToState();
    
    stopRopeAnimation();
    
    // If auto-scroll was active in 3D, continue it in 2D mode
    if (autoRead.active) {
      // Start the 2D interval timer (3D uses animation loop, 2D uses setInterval)
      const interval = parseInt($('autoInterval').value, 10) * 1000;
      const direction = $('autoDirection').value;
      
      autoRead.intervalId = setInterval(() => {
        const currentPercent = parseFloat($('percent').textContent) || 0;
        const atEnd = direction === 'forward' && (state.nextByteStart == null || currentPercent >= 99.5);
        const atStart = direction === 'backward' && navHistoryStack.length === 0 && currentPercent <= 0.5;
        
        if (atEnd || atStart) {
          fadeAndExecute(() => teleportToRandomLocation());
          return;
        }
        navigate(direction);
      }, interval);
    }
  }
}

// Sync rope position to state for URL update
function updateRopeToState() {
  if (!rope3d.active || rope3d.allWords.length === 0) return;
  
  // Use tracked viewBytePosition for accurate URL
  state.byteStart = Math.max(0, Math.floor(rope3d.viewBytePosition));
  updateHash();
}

// Reload rope with new chunk size
async function reloadRopeWithChunkSize(newChunkSize) {
  if (!rope3d.active || state.loading) return;
  
  state.loading = true;
  try {
    // Use tracked viewBytePosition for accurate reload position
    const currentByte = Math.floor(rope3d.viewBytePosition);
    
    // Fetch new chunk at current position
    const data = await fetchChunk(state.bookId, currentByte, newChunkSize);
    
    state.byteStart = data.byteStart;
    state.byteEnd = data.byteEnd;
    state.nextByteStart = data.nextByteStart;
    state.chunkSize = newChunkSize;
    
    const newText = data.formattedText || data.words.join(' ');
    const words = newText.split(/\s+/).filter(w => w.length > 0);
    setRopeWords(words);
    rope3d.wordOffset = 0;
    rope3d.firstByteStart = data.byteStart;
    rope3d.lastByteEnd = data.byteEnd;
    rope3d.viewBytePosition = data.byteStart; // Reset to chunk start
    rope3d.backwardHistory = [...navHistoryStack];
    
    if (rope3d.allWords.length > 0) {
      rope3d.bytesPerWord = (data.byteEnd - data.byteStart) / rope3d.allWords.length;
    }
    
    updateHash(true); // Force after explicit reload
    showHint(`Loaded ${rope3d.allWords.length} words`);
  } catch (err) {
    console.error('Failed to reload rope:', err);
  } finally {
    state.loading = false;
  }
}

// Teleport to random location in random book (works in both 2D and 3D mode)
async function teleportToRandomLocation() {
  if (state.loading) return;
  
  state.loading = true;
  updateButtonStates();
  
  const modal = $('teleportModal');
  const MAX_RETRIES = 15; // More retries since this is automatic
  let attempts = 0;
  const lang = $('searchLanguage').value;
  
  while (attempts < MAX_RETRIES) {
    attempts++;
    
    try {
      // Get a random book from the catalog
      const randomRes = await fetch('/api/random?lang=' + encodeURIComponent(lang));
      if (!randomRes.ok) {
        throw new Error('Failed to get random book');
      }
      const book = await randomRes.json();
      if (book.error) throw new Error(book.error);
      
      const randomBookId = parseInt(book.id, 10);
      
      // Show the modal with book info while loading
      showBookChangeModal(book.title, book.author, false);
      
      // Init the book to get boundaries
      const initRes = await fetch(`/api/book/${randomBookId}/init?chunkSize=${state.chunkSize}`);
      if (!initRes.ok) {
        // Book might not have plain text, try another
        modal.classList.remove('visible');
        console.log(`Book ${randomBookId} failed to init, trying another... (attempt ${attempts})`);
        continue;
      }
      const initData = await initRes.json();
      if (initData.error) {
        modal.classList.remove('visible');
        console.log(`Book ${randomBookId} error: ${initData.error}, trying another... (attempt ${attempts})`);
        continue;
      }
      
      // Pick random position within book (5-95%)
      const randomPercent = Math.floor(Math.random() * 90) + 5;
      const totalCleanBytes = initData.docEnd - initData.docStart;
      const randomByteOffset = Math.floor(totalCleanBytes * (randomPercent / 100));
      const randomByteStart = initData.docStart + randomByteOffset;
      
      // Fetch chunk at random position
      const data = await fetchChunk(randomBookId, randomByteStart, state.chunkSize);
      
      // Update state
      state.bookId = randomBookId;
      state.byteStart = data.byteStart;
      state.byteEnd = data.byteEnd;
      state.nextByteStart = data.nextByteStart ?? null;
      state.docStart = initData.docStart;
      state.docEnd = initData.docEnd;
      state.bookTitle = book.title || '';
      state.bookAuthor = book.author || '';
      
      // Clear navigation history
      navHistoryStack.length = 0;
      
      // Update title bar
      $('titleBarTitle').textContent = state.bookTitle || `Book ${randomBookId}`;
      $('titleBarAuthor').textContent = state.bookAuthor || '';
      
      if (rope3d.active) {
        // 3D mode: fade out, reset rope, fade in
        fadeCanvas(0.3, 100, () => {
          const newText = data.formattedText || data.words.join(' ');
          const words = newText.split(/\s+/).filter(w => w.length > 0);
          setRopeWords(words);
          rope3d.wordOffset = 0;
          // Preserve momentum if auto-read/Jump Around is active for graceful transition
          if (!autoRead.active) {
            rope3d.momentum = 0;
          }
          rope3d.firstByteStart = data.byteStart;
          rope3d.lastByteEnd = data.byteEnd;
          rope3d.viewBytePosition = data.byteStart; // Set accurate byte position
          rope3d.backwardHistory = [];
          rope3d.justToggledFrames = 60; // Prevent immediate re-teleport
          
          if (rope3d.allWords.length > 0) {
            rope3d.bytesPerWord = (data.byteEnd - data.byteStart) / rope3d.allWords.length;
          }
          
          // Fade back in
          fadeCanvas(1, 100);
        });
      } else {
        // 2D mode: update content display (fade handled by CSS)
        updateUI(data);
      }
      
      updateHash(true); // Force after teleport
      recordNavigation(); // Log in history
      
      // Fade out modal, re-enable buttons when modal hides
      setTimeout(() => {
        modal.classList.remove('visible');
        state.loading = false;
        updateButtonStates();
      }, 500);
      
      return; // Success!
      
    } catch (err) {
      console.error(`Teleport attempt ${attempts} failed:`, err);
      modal.classList.remove('visible');
      
      // Check if this is a "no plain text" error - just continue to next attempt
      if (err.message && err.message.includes('No plain text')) {
        console.log(`Book has no plain text, trying another...`);
        continue;
      }
      
      // For other errors, also just continue
      continue;
    }
  }
  
  // Exhausted all retries
  modal.classList.remove('visible');
  showHint('Could not find a readable book. Please try again.');
  state.loading = false;
  updateButtonStates();
}

// Get auto-scroll speed from slider (words per second)
function getAutoScrollSpeed() {
  const cfg = rope3d.config;
  const sliderVal = parseInt($('speedSlider').value, 10) / 100; // 0 to 1
  return cfg.AUTO_SPEED_MIN + sliderVal * (cfg.AUTO_SPEED_MAX - cfg.AUTO_SPEED_MIN);
}

// Get speed-scaled momentum for manual controls (arrows, buttons)
// Returns words to move per keypress, scaled by speed slider
// With MOMENTUM_DECAY of 0.95, total movement = momentum / (1 - 0.95) = momentum * 20
// So to move ~0.3 words total per keypress at default speed (1.0), we need momentum = 0.015
function getManualMomentum() {
  const speed = getAutoScrollSpeed();
  // At min speed (0.2), move very little per press
  // At max speed (5.0), move a bit more
  // Reduced from 0.1 to 0.015 for much smoother scrolling
  return speed * 0.015;
}

// Get scroll wheel sensitivity scaled by speed
function getScrollSensitivity() {
  const speed = getAutoScrollSpeed();
  // At min speed, very insensitive (need more scrolls)
  // At max speed, very sensitive
  // Reduced from 0.008 to 0.003 for smoother wheel scrolling
  return speed * 0.003;
}

// Reset camera rotation
function resetCameraView() {
  rope3d.cameraPitch = 0;
  rope3d.cameraYaw = 0;
  showHint('View reset');
}

// Update speed display - show words per second
function updateSpeedDisplay() {
  const speed = getAutoScrollSpeed();
  $('speedValue').textContent = speed.toFixed(1) + ' w/s';
}

function startRopeAnimation() {
  if (rope3d.animationId) return;
  rope3d.lastFrameTime = performance.now();
  let frameCount = 0;
  
  function animate(time) {
    if (!rope3d.active) return;
    
    // Periodic UI state sync check (every ~1 second)
    frameCount++;
    if (frameCount >= 60) {
      frameCount = 0;
      syncAutoReadUI();
    }
    
    // Calculate delta time
    const dt = Math.min(100, time - rope3d.lastFrameTime) / 1000; // seconds, capped
    rope3d.lastFrameTime = time;
    
    // Skip all processing if we're in a loading/teleport state
    // Exception: during Jump Around mode or auto-read, keep scrolling for smooth transitions
    if (state.loading && !jumpAround.active && !autoRead.active) {
      renderRopeFrame(time);
      rope3d.animationId = requestAnimationFrame(animate);
      return;
    }
    
    // Decrement justToggledFrames counter - prevents teleportation right after toggling to 3D
    if (rope3d.justToggledFrames > 0) {
      rope3d.justToggledFrames--;
    }
    
    // Track wordOffset before changes for byte position update
    const wordOffsetBefore = rope3d.wordOffset;
    
    // Auto-scroll when auto-read is active in 3D mode
    if (autoRead.active && !rope3d.isDragging) {
      const speed = getAutoScrollSpeed();
      const direction = $('autoDirection').value === 'forward' ? 1 : -1;
      rope3d.wordOffset += speed * direction * dt;
    }
    
    // Apply momentum (from manual scrolling)
    if (!rope3d.isDragging && !autoRead.active && Math.abs(rope3d.momentum) > 0.005) {
      rope3d.wordOffset += rope3d.momentum;
      rope3d.momentum *= rope3d.config.MOMENTUM_DECAY;
    }
    
    // Update viewBytePosition based on wordOffset movement
    // This tracks the actual byte position independently of prefetch operations
    const wordOffsetDelta = rope3d.wordOffset - wordOffsetBefore;
    rope3d.viewBytePosition += wordOffsetDelta * rope3d.bytesPerWord;
    // Clamp to valid range
    rope3d.viewBytePosition = Math.max(state.docStart || 0, 
      Math.min(rope3d.viewBytePosition, state.docEnd || rope3d.viewBytePosition));
    
    // BOUNDARY DETECTION
    const isMovingForward = autoRead.active
      ? $('autoDirection').value === 'forward'
      : (wordOffsetDelta > 0.001 || rope3d.momentum > 0.01);
    const docEnd = state.docEnd || 0;
    const docStart = state.docStart || 0;
    const totalBytes = docEnd - docStart;
    const bytesFromStart = rope3d.viewBytePosition - docStart;
    const noMoreContent = state.nextByteStart === null;
    const nearEndByBytes = totalBytes > 0 && bytesFromStart >= totalBytes - 100;
    const atDocEndByPosition = totalBytes > 0 && rope3d.viewBytePosition >= docEnd - 50;
    const nearEndOfWords = rope3d.allWords.length > 0 && 
      rope3d.wordOffset >= rope3d.allWords.length - 10;
    const atForwardBoundary = ((noMoreContent && nearEndByBytes) || 
      (atDocEndByPosition && nearEndOfWords)) &&
      isMovingForward &&
      rope3d.justToggledFrames === 0;
    
    const isMovingBackward = autoRead.active
      ? $('autoDirection').value === 'backward'
      : (wordOffsetDelta < -0.001 || rope3d.momentum < -0.01);
    const currentPercent = totalBytes > 0 ? ((rope3d.viewBytePosition - docStart) / totalBytes * 100) : 0;
    const atDocStart = rope3d.firstByteStart <= docStart + 100;
    const atWordStart = rope3d.wordOffset <= 1;
    const atBackwardBoundary = atWordStart &&
      (atDocStart || currentPercent <= 0.5) &&
      isMovingBackward &&
      rope3d.justToggledFrames === 0;
    
    // Handle boundary teleportation based on mode
    if (atForwardBoundary || atBackwardBoundary) {
      if (jumpAround.active) {
        // During Jump Around: use appropriate jump function and reset timer
        if (jumpAround.timeoutId) {
          clearTimeout(jumpAround.timeoutId);
          jumpAround.timeoutId = null;
        }
        if (jumpAround.sameBook) {
          goToRandomLocationInSameBook();
        } else {
          goToRandomLocation();
        }
        // Reschedule next jump
        scheduleNextJump();
      } else {
        // Normal mode: teleport
        teleportToRandomLocation();
      }
      rope3d.animationId = requestAnimationFrame(animate);
      return;
    }
    
    // Clamp position (in word units now)
    // Don't clamp to 0 if there's more backward content to load
    const maxWord = Math.max(0, rope3d.allWords.length - 1);
    const minWord = rope3d.firstByteStart > (state.docStart || 0) ? -5 : 0; // Allow slight negative to trigger backward load
    rope3d.wordOffset = Math.max(minWord, Math.min(rope3d.wordOffset, maxWord));
    
    checkRopePrefetch();
    renderRopeFrame(time);
    
    rope3d.animationId = requestAnimationFrame(animate);
  }
  
  rope3d.animationId = requestAnimationFrame(animate);
}

function stopRopeAnimation() {
  if (rope3d.animationId) {
    cancelAnimationFrame(rope3d.animationId);
    rope3d.animationId = null;
  }
}

function renderRopeFrame(time) {
  const ctx = rope3d.ctx;
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cfg = rope3d.config;
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  
  // Get theme colors and font from CSS variables
  const style = getComputedStyle(document.documentElement);
  const bgColor = style.getPropertyValue('--canvas-bg').trim() || '#ffffff';
  const textColor = style.getPropertyValue('--rope-text').trim() || '#000000';
  const fontFamily = style.getPropertyValue('--font-body').trim() || 'Georgia, serif';
  
  // Parse text color to RGB for depth fading
  const textRgb = parseColorToRgb(textColor);
  const bgRgb = parseColorToRgb(bgColor);
  
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);
  
  if (rope3d.allWords.length === 0) {
    ctx.fillStyle = style.getPropertyValue('--text-muted').trim() || 'rgba(0,0,0,0.5)';
    ctx.font = `18px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading text...', W/2, H/2);
    return;
  }
  
  // Compute camera frame - camera follows the spline!
  const camFrame = computeCameraFrame(rope3d.wordOffset);
  
  // Determine visible word range (words ahead of camera)
  const visibleWords = Math.ceil(cfg.FAR_CLIP / cfg.WORD_SPACING) + 5;
  const startWord = Math.max(0, Math.floor(rope3d.wordOffset) - 3);
  const endWord = Math.min(rope3d.allWords.length - 1, startWord + visibleWords);
  
  // Collect visible words with projections
  const wordsToRender = [];
  
  for (let i = startWord; i <= endWord; i++) {
    const word = rope3d.allWords[i];
    if (!word || word.trim() === '') continue;
    
    const worldPos = ropePathPosition(i);
    const proj = projectToCameraSpace(worldPos, camFrame, W, H);
    
    if (!proj) continue;
    if (proj.depth < cfg.NEAR_CLIP || proj.depth > cfg.FAR_CLIP) continue;
    if (proj.screenX < -200 || proj.screenX > W + 200) continue;
    if (proj.screenY < -200 || proj.screenY > H + 200) continue;
    
    wordsToRender.push({
      word,
      index: i,
      worldPos,
      proj,
      opacity: ropeOpacity(proj.depth)
    });
  }
  
  // Sort by depth (far to near)
  wordsToRender.sort((a, b) => b.proj.depth - a.proj.depth);
  
  // Draw connector strand first (behind words)
  if (cfg.SHOW_CONNECTOR && wordsToRender.length > 1) {
    drawWordConnector(ctx, wordsToRender, camFrame, W, H);
  }
  
  // Render each word
  for (const item of wordsToRender) {
    // Apply global fade and per-word opacity
    const effectiveOpacity = item.opacity * canvasFadeOpacity;
    if (effectiveOpacity < 0.02) continue;
    
    const fontSize = Math.max(cfg.MIN_FONT_SIZE, cfg.BASE_FONT_SIZE * item.proj.scale);
    if (fontSize < 5) continue;
    
    ctx.save();
    ctx.translate(item.proj.screenX, item.proj.screenY);
    
    // Check if this word should be italic
    const isItalic = rope3d.wordItalicMap[item.index] || false;
    const fontStyle = isItalic ? 'italic ' : '';
    ctx.font = `${fontStyle}${Math.round(fontSize)}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Text color fading to background with distance
    const depthFactor = item.proj.depth / cfg.FAR_CLIP;
    const r = Math.round(textRgb.r + (bgRgb.r - textRgb.r) * depthFactor);
    const g = Math.round(textRgb.g + (bgRgb.g - textRgb.g) * depthFactor);
    const b = Math.round(textRgb.b + (bgRgb.b - textRgb.b) * depthFactor);
    
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${effectiveOpacity})`;
    ctx.fillText(item.word, 0, 0);
    
    ctx.restore();
  }
  
  // Update progress - use tracked viewBytePosition for accurate percent
  // This prevents oscillation when prefetch changes bytesPerWord
  const totalBytes = (state.docEnd || 1) - (state.docStart || 0);
  const bytesFromStart = Math.max(0, rope3d.viewBytePosition - (state.docStart || 0));
  const percent = totalBytes > 0 ? Math.min(100, (bytesFromStart / totalBytes) * 100).toFixed(1) : 0;
  $('percent').textContent = `${percent}%`;
  $('progress').style.width = `${percent}%`;
}

// Draw connector line between words - the "strand"
function drawWordConnector(ctx, wordsToRender, camFrame, W, H) {
  const cfg = rope3d.config;
  
  // Sort by index for line drawing
  const sorted = [...wordsToRender].sort((a, b) => a.index - b.index);
  
  ctx.beginPath();
  let lastIndex = -999;
  
  for (const item of sorted) {
    // Only connect adjacent words
    if (item.index - lastIndex === 1) {
      ctx.lineTo(item.proj.screenX, item.proj.screenY);
    } else {
      ctx.moveTo(item.proj.screenX, item.proj.screenY);
    }
    lastIndex = item.index;
  }
  
  ctx.strokeStyle = `rgba(200, 200, 200, ${cfg.CONNECTOR_OPACITY * 3 * canvasFadeOpacity})`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

async function checkRopePrefetch() {
  if (state.loading) return;
  
  const cfg = rope3d.config;
  const wordsRemaining = rope3d.allWords.length - Math.floor(rope3d.wordOffset);
  const wordsFromStart = Math.floor(rope3d.wordOffset);
  
  // Forward prefetch
  if (wordsRemaining < cfg.PREFETCH_THRESHOLD && state.nextByteStart !== null) {
    await loadMoreRopeContent('forward');
  }
  
  // Backward prefetch - load previous content when near start of loaded words
  // Trigger even if wordOffset is negative (which means we need content NOW)
  if (wordsFromStart < cfg.BACKWARD_PREFETCH_THRESHOLD && rope3d.firstByteStart > (state.docStart || 0)) {
    await loadMoreRopeContent('backward');
  }
  
  // CRITICAL: If we're at docStart (can't load more backward) AND user is actively trying to go backward
  // (negative momentum or auto-read backward), jump to word 0 immediately so boundary check can trigger teleport.
  // Without this, user has to scroll through ALL loaded content to reach wordOffset=0.
  // NOTE: Only do this when actually moving backward - NOT when auto-reading forward!
  // IMPORTANT: During auto-read, ONLY consider the auto-read direction, not momentum.
  // This prevents teleportation when user clicks back button while auto-reading forward.
  const atDocStart = rope3d.firstByteStart <= (state.docStart || 0) + 100;
  const isMovingBackward = autoRead.active 
    ? $('autoDirection').value === 'backward'  // During auto-read: only check direction setting
    : rope3d.momentum < -0.001;  // Manual: check momentum
  
  if (atDocStart && wordsFromStart < cfg.BACKWARD_PREFETCH_THRESHOLD && isMovingBackward) {
    rope3d.wordOffset = 0;
    rope3d.viewBytePosition = state.docStart || 0;
  }
  
  // CRITICAL: If we're at docEnd (can't load more forward) AND user is actively trying to go forward
  // (positive momentum or auto-read forward), snap viewBytePosition to docEnd so boundary check can trigger teleport.
  // This mirrors the backward snap logic above.
  const atDocEnd = state.nextByteStart === null;
  const isMovingForward = autoRead.active
    ? $('autoDirection').value === 'forward'  // During auto-read: only check direction setting
    : rope3d.momentum > 0.001;  // Manual: check momentum
  
  if (atDocEnd && wordsRemaining < cfg.PREFETCH_THRESHOLD && isMovingForward) {
    rope3d.viewBytePosition = state.docEnd || rope3d.viewBytePosition;
  }
  
  // Periodically update URL based on position
  updateRopeToState();
}

async function loadMoreRopeContent(direction = 'forward') {
  if (state.loading) return;
  
  if (direction === 'forward') {
    if (state.nextByteStart == null) return;
    
    state.loading = true;
    try {
      navHistoryStack.push(state.byteStart);
      const data = await fetchChunk(state.bookId, state.nextByteStart, state.chunkSize);
      
      // If we got 0 words, we've hit end of book
      if (data.actualCount === 0 || (data.words && data.words.length === 0)) {
        navHistoryStack.pop();
        state.nextByteStart = null; // Signal end of book
        state.loading = false;
        return;
      }
      
      state.byteStart = data.byteStart;
      state.byteEnd = data.byteEnd;
      state.nextByteStart = data.nextByteStart ?? null;
      
      const newText = data.formattedText || data.words.join(' ');
      const newWords = newText.split(/\s+/).filter(w => w.length > 0);
      appendRopeWords(newWords);
      
      // Update lastByteEnd to track forward progress
      rope3d.lastByteEnd = data.byteEnd;
      
      // Update bytes per word estimate based on all loaded content
      if (rope3d.allWords.length > 0) {
        rope3d.bytesPerWord = (rope3d.lastByteEnd - rope3d.firstByteStart) / rope3d.allWords.length;
      }
    } catch (err) {
      console.error('Rope prefetch forward failed:', err);
      navHistoryStack.pop();
    } finally {
      state.loading = false;
    }
  } else {
    // Backward loading - calculate previous chunk position from byte offset
    if (rope3d.firstByteStart <= (state.docStart || 0)) {
      // Already at start - if user keeps trying to go backward, teleport!
      // Set wordOffset to 0 to trigger boundary check
      rope3d.wordOffset = 0;
      rope3d.viewBytePosition = state.docStart || 0;
      return;
    }
    
    state.loading = true;
    try {
      // Calculate where the previous chunk should start
      // Go back by approximately chunkSize words worth of bytes
      const bytesToGoBack = Math.floor(state.chunkSize * rope3d.bytesPerWord);
      const prevByteStart = Math.max(state.docStart || 0, rope3d.firstByteStart - bytesToGoBack);
      
      // If we can't go further back, we're at the start
      if (prevByteStart >= rope3d.firstByteStart) {
        rope3d.firstByteStart = state.docStart || 0; // Signal we're at boundary
        rope3d.wordOffset = 0; // Jump to start so boundary check triggers
        rope3d.viewBytePosition = state.docStart || 0;
        state.loading = false;
        return;
      }
      
      const data = await fetchChunk(state.bookId, prevByteStart, state.chunkSize);
      
      // If we got 0 words, we're at the start of actual content
      if (data.actualCount === 0 || (data.words && data.words.length === 0)) {
        // Set firstByteStart to docStart to trigger teleport on next backward attempt
        rope3d.firstByteStart = state.docStart || 0;
        rope3d.wordOffset = 0; // Jump to start so boundary check triggers
        rope3d.viewBytePosition = state.docStart || 0;
        state.loading = false;
        return;
      }
      
      // Protection against oscillation: if server returned a position that's not
      // actually earlier than what we have, we can't make progress backward
      // Use chunk-relative threshold based on expected movement
      const minExpectedProgress = Math.max(1, Math.floor(bytesToGoBack * 0.5));
      if (data.byteStart >= rope3d.firstByteStart - minExpectedProgress) {
        // Signal we're at the start by setting firstByteStart very low
        rope3d.firstByteStart = state.docStart || 0;
        rope3d.wordOffset = 0; // Jump to start so boundary check triggers
        rope3d.viewBytePosition = state.docStart || 0;
        state.loading = false;
        return;
      }
      
      const newText = data.formattedText || data.words.join(' ');
      const newWords = newText.split(/\s+/).filter(w => w.length > 0);
      
      // Prepend words and adjust offset so view doesn't jump
      const wordCountBefore = rope3d.allWords.length;
      prependRopeWords(newWords);
      const addedWords = rope3d.allWords.length - wordCountBefore;
      rope3d.wordOffset += addedWords;
      rope3d.firstByteStart = data.byteStart;
      
      // Update bytes per word estimate based on all loaded content
      if (rope3d.allWords.length > 0) {
        rope3d.bytesPerWord = (rope3d.lastByteEnd - rope3d.firstByteStart) / rope3d.allWords.length;
      }
    } catch (err) {
      console.error('Rope prefetch backward failed:', err);
    } finally {
      state.loading = false;
    }
  }
}

// Input handlers
function handleRopeWheel(e) {
  if (!rope3d.active) return;
  e.preventDefault();
  // Scroll sensitivity scales with speed setting
  rope3d.momentum += (e.deltaY > 0 ? 1 : -1) * getScrollSensitivity();
}

function handleRopePointerDown(e) {
  if (!rope3d.active) return;
  rope3d.isRotating = true;
  rope3d.lastX = e.clientX;
  rope3d.lastY = e.clientY;
  rope3d.lastTime = Date.now();
  rope3d.canvas.setPointerCapture(e.pointerId);
}

function handleRopePointerMove(e) {
  if (!rope3d.active || !rope3d.isRotating) return;
  
  const cfg = rope3d.config;
  const deltaX = e.clientX - rope3d.lastX;
  const deltaY = e.clientY - rope3d.lastY;
  
  // Update camera rotation (yaw and pitch)
  rope3d.cameraYaw += deltaX * cfg.ROTATION_SPEED;
  rope3d.cameraPitch += deltaY * cfg.ROTATION_SPEED;
  
  // Clamp rotation to limits
  rope3d.cameraYaw = Math.max(-cfg.MAX_YAW, Math.min(cfg.MAX_YAW, rope3d.cameraYaw));
  rope3d.cameraPitch = Math.max(-cfg.MAX_PITCH, Math.min(cfg.MAX_PITCH, rope3d.cameraPitch));
  
  rope3d.lastX = e.clientX;
  rope3d.lastY = e.clientY;
}

function handleRopePointerUp(e) {
  if (!rope3d.active) return;
  rope3d.isRotating = false;
  rope3d.canvas.releasePointerCapture(e.pointerId);
}

// Sync when content updates
function syncRopeWords() {
  if (!rope3d.active) return;
  
  const content = $('content').textContent || '';
  const newWords = content.split(/\s+/).filter(w => w.length > 0);
  
  // Only sync if we have new words and they're different from current
  if (newWords.length > 0) {
    const currentWords = rope3d.allWords.join(' ');
    const newWordsStr = newWords.join(' ');
    
    // If content has changed significantly, resync
    if (currentWords !== newWordsStr) {
      setRopeWords(newWords);
      rope3d.wordOffset = 0;
      // Update byte tracking to match new state
      rope3d.firstByteStart = state.byteStart || 0;
      rope3d.lastByteEnd = state.byteEnd || 0;
      rope3d.viewBytePosition = state.byteStart || 0;
      if (rope3d.allWords.length > 0 && state.byteEnd > state.byteStart) {
        rope3d.bytesPerWord = (state.byteEnd - state.byteStart) / rope3d.allWords.length;
      }
    }
  } else if (rope3d.allWords.length === 0) {
    // Rope is empty - initialize with whatever we have
    setRopeWords(newWords);
    rope3d.wordOffset = 0;
  }
}

// Full resync of rope from current content (used after random book/location)
function syncRopeFromContent() {
  if (!rope3d.active) return;
  
  const content = $('content').textContent || '';
  const words = content.split(/\s+/).filter(w => w.length > 0);
  setRopeWords(words);
  rope3d.wordOffset = 0;
  rope3d.momentum = 0;
  rope3d.firstByteStart = state.byteStart || 0;
  rope3d.lastByteEnd = state.byteEnd || 0;
  rope3d.viewBytePosition = state.byteStart || 0; // Set accurate byte position
  rope3d.backwardHistory = [...navHistoryStack];
  
  if (rope3d.allWords.length > 0 && state.byteEnd > state.byteStart) {
    rope3d.bytesPerWord = (state.byteEnd - state.byteStart) / rope3d.allWords.length;
  }
}

// Initialize
initRope3D();
$('modeToggle').addEventListener('click', (e) => {
  e.target.blur();
  toggleRopeMode();
  refocusAfterButton();
});
$('speedSlider').addEventListener('input', updateSpeedDisplay);
$('speedSlider').addEventListener('change', () => {
  $('speedSlider').blur();
  if (rope3d.active) rope3d.canvas.focus();
});
updateSpeedDisplay(); // Initialize display

// ========== Through-line toggle ==========
// Load saved setting - default to false (unchecked)
const savedThroughLine = localStorage.getItem('gutex-through-line');
const showLine = savedThroughLine === 'true'; // false if null or 'false'
$('showThroughLine').checked = showLine;
rope3d.config.SHOW_CONNECTOR = showLine;

$('showThroughLine').addEventListener('change', (e) => {
  rope3d.config.SHOW_CONNECTOR = e.target.checked;
  localStorage.setItem('gutex-through-line', e.target.checked);
  // Sync with floating control
  $('floatingThroughLine').checked = e.target.checked;
});

// ========== Floating 3D controls sync ==========
// Sync floating speed slider with main slider
$('floatingSpeedSlider').addEventListener('input', (e) => {
  $('speedSlider').value = e.target.value;
  updateSpeedDisplay();
});
$('floatingSpeedSlider').addEventListener('change', () => {
  if (rope3d.active) rope3d.canvas.focus();
});

// Sync floating through-line checkbox with main checkbox
$('floatingThroughLine').addEventListener('change', (e) => {
  $('showThroughLine').checked = e.target.checked;
  rope3d.config.SHOW_CONNECTOR = e.target.checked;
  localStorage.setItem('gutex-through-line', e.target.checked);
});

// Function to update floating controls from main controls
function syncFloatingControls() {
  if (!$('floatingSpeedSlider')) return; // Guard against missing elements
  $('floatingSpeedSlider').value = $('speedSlider').value;
  $('floatingSpeedValue').textContent = $('speedValue').textContent;
  $('floatingThroughLine').checked = $('showThroughLine').checked;
  $('floatingPercent').textContent = $('percent').textContent;
  $('floatingProgressFill').style.width = $('progressFill').style.width;
}

// Update floating controls when main controls change
const originalUpdateSpeedDisplay = updateSpeedDisplay;
updateSpeedDisplay = function() {
  originalUpdateSpeedDisplay();
  if ($('floatingSpeedValue')) {
    $('floatingSpeedValue').textContent = $('speedValue').textContent;
    $('floatingSpeedSlider').value = $('speedSlider').value;
  }
};

// Sync progress periodically when in 3D mode
setInterval(() => {
  if (rope3d.active && $('floatingPercent')) {
    $('floatingPercent').textContent = $('percent').textContent;
    $('floatingProgressFill').style.width = $('progressFill').style.width;
  }
}, 500);

// Initialize floating controls
syncFloatingControls();

// ========== Interactive Progress Bar Slider ==========
// Allows user to seek to any position in the book by clicking/dragging

let progressSeekTimeout = null;
const PROGRESS_SEEK_DEBOUNCE = 300; // ms to wait before triggering navigation
let activeProgressTrack = null; // Track which element is being dragged

function calculateByteFromPercent(percent) {
  // Calculate target byte position from percentage
  const docStart = state.docStart || 0;
  const docEnd = state.docEnd || 0;
  if (docEnd <= docStart) return null;
  
  const targetByte = Math.floor(docStart + (percent / 100) * (docEnd - docStart));
  return Math.max(docStart, Math.min(docEnd, targetByte));
}

function updateProgressDisplay(percent) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  $('progressFill').style.width = `${clampedPercent}%`;
  $('progress').style.width = `${clampedPercent}%`;
  $('percent').textContent = `${Math.round(clampedPercent)}%`;
  if ($('floatingProgressFill')) {
    $('floatingProgressFill').style.width = `${clampedPercent}%`;
    $('floatingPercent').textContent = `${Math.round(clampedPercent)}%`;
  }
  if ($('floatingPercentCompact')) {
    $('floatingPercentCompact').textContent = `${Math.round(clampedPercent)}%`;
  }
}

function seekToPercent(percent) {
  if (!state.bookId || state.loading) return;
  
  const targetByte = calculateByteFromPercent(percent);
  if (targetByte === null) return;
  
  // Clear any pending seek
  if (progressSeekTimeout) {
    clearTimeout(progressSeekTimeout);
  }
  
  // Update visual feedback immediately
  updateProgressDisplay(percent);
  
  // Debounce the actual navigation
  progressSeekTimeout = setTimeout(() => {
    initBook(state.bookId, targetByte, state.chunkSize, false).catch(err => {
      console.error('Progress seek navigation failed:', err);
    });
  }, PROGRESS_SEEK_DEBOUNCE);
}

function getPercentFromEvent(e, track) {
  const rect = track.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const x = clientX - rect.left;
  return Math.max(0, Math.min(100, (x / rect.width) * 100));
}

// Document-level handlers (only added once)
document.addEventListener('mousemove', (e) => {
  if (!activeProgressTrack) return;
  e.preventDefault();
  const percent = getPercentFromEvent(e, activeProgressTrack);
  seekToPercent(percent);
});

document.addEventListener('mouseup', () => {
  if (activeProgressTrack) {
    activeProgressTrack.classList.remove('dragging');
    activeProgressTrack = null;
  }
});

document.addEventListener('touchmove', (e) => {
  if (!activeProgressTrack) return;
  e.preventDefault();
  const percent = getPercentFromEvent(e, activeProgressTrack);
  seekToPercent(percent);
}, { passive: false });

document.addEventListener('touchend', () => {
  if (activeProgressTrack) {
    activeProgressTrack.classList.remove('dragging');
    activeProgressTrack = null;
  }
});

document.addEventListener('touchcancel', () => {
  if (activeProgressTrack) {
    activeProgressTrack.classList.remove('dragging');
    activeProgressTrack = null;
  }
});

function setupProgressTrack(trackElement) {
  if (!trackElement) return;
  
  function handleStart(e) {
    if (!state.bookId || state.loading || !state.docEnd) return;
    e.preventDefault();
    e.stopPropagation();
    activeProgressTrack = trackElement;
    trackElement.classList.add('dragging');
    const percent = getPercentFromEvent(e, trackElement);
    seekToPercent(percent);
  }
  
  trackElement.addEventListener('mousedown', handleStart);
  trackElement.addEventListener('touchstart', handleStart, { passive: false });
}

// Set up both progress tracks
setupProgressTrack(document.querySelector('.header-track'));
setupProgressTrack(document.querySelector('.floating-3d-controls .progress-track'));

// ========== Floating controls expand/collapse ==========
$('controlsToggle').addEventListener('click', () => {
  $('floating3dControls').classList.toggle('expanded');
  // Save state
  localStorage.setItem('gutex-controls-expanded', $('floating3dControls').classList.contains('expanded'));
});

// Restore expanded state
if (localStorage.getItem('gutex-controls-expanded') === 'true') {
  $('floating3dControls').classList.add('expanded');
}

// ========== Floating controls position ==========
const posButtons = document.querySelectorAll('.floating-3d-controls .pos-btn');
posButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const pos = btn.dataset.pos;
    const panel = $('floating3dControls');
    // Remove all position classes
    panel.classList.remove('pos-top-left', 'pos-top-right', 'pos-bottom-left', 'pos-bottom-right');
    // Add new position class (bottom-right is default, no class needed)
    if (pos !== 'bottom-right') {
      panel.classList.add('pos-' + pos);
    }
    // Update active button
    posButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Save preference
    localStorage.setItem('gutex-controls-position', pos);
  });
});

// Restore position
const savedPos = localStorage.getItem('gutex-controls-position');
if (savedPos && savedPos !== 'bottom-right') {
  $('floating3dControls').classList.add('pos-' + savedPos);
  posButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pos === savedPos);
  });
}

// Update compact percent display
const originalSyncFloating = syncFloatingControls;
syncFloatingControls = function() {
  originalSyncFloating();
  if ($('floatingPercentCompact')) {
    $('floatingPercentCompact').textContent = $('percent').textContent;
  }
};

// Update compact display periodically
setInterval(() => {
  if (rope3d.active && $('floatingPercentCompact')) {
    $('floatingPercentCompact').textContent = $('percent').textContent;
  }
}, 500);

// ========== Excerpt mode ==========
// Simple: use same API as main UI, curl uses byteStart/byteEnd from response

function isExcerptMode() {
  return window.location.search.includes('excerpt=1');
}

function openExcerptView() {
  // CRITICAL: Use state values to ensure excerpt shows what's displayed
  const base = window.location.origin + window.location.pathname;
  const currentTheme = localStorage.getItem('gutex-theme') || 'default';
  const currentByte = rope3d.active ? Math.floor(rope3d.viewBytePosition) : state.byteStart;
  const hash = `#${state.bookId},${currentByte},${state.chunkSize}`;
  window.open(`${base}?excerpt=1&theme=${currentTheme}${hash}`, '_blank');
}

function formatExcerptText(text) {
  // Replace double excerpts with single excerpts (since we wrap in double excerpts)
  let formatted = text.trim().replace(/"/g, "'");
  
  const startsWithCapital = /^[A-Z]/.test(formatted);
  const endsWithPunctuation = /[.!?;:,'"')\]]$/.test(formatted);
  
  const leftEllipsis = startsWithCapital ? '' : '… ';
  const rightEllipsis = endsWithPunctuation ? '' : ' …';
  
  return '"' + leftEllipsis + formatted + rightEllipsis + '"';
}

async function initExcerptMode() {
  document.body.classList.add('excerpt-mode');
  $('content').textContent = 'Loading...';
  
  // Add subtle home link in lower left
  const homeLink = document.createElement('a');
  homeLink.href = '/';
  homeLink.className = 'excerpt-home-link';
  homeLink.textContent = 'gutex';
  document.body.appendChild(homeLink);
  
  const params = parseHash();
  if (!params) {
    $('content').textContent = 'No book specified.';
    return;
  }
  
  try {
    // Fetch using same API as main UI - response has exact byteStart/byteEnd
    const data = await fetchChunk(params.bookId, params.byteStart, params.chunkSize);
    if (!data || !data.words) throw new Error('No content returned');
    
    const text = data.formattedText || data.words.join(' ');
    const byteStart = data.byteStart;
    const byteEnd = data.byteEnd;
    
    // Fetch book info
    let bookTitle = `Book ${params.bookId}`;
    let bookAuthor = '';
    try {
      const infoRes = await fetch(`/api/bookinfo/${params.bookId}`);
      const info = await infoRes.json();
      if (info.title) bookTitle = info.title;
      if (info.author) {
        bookAuthor = info.author
          .replace(/,\s*\d{4}-\d{4}/g, '')
          .replace(/,\s*\d{4}-/g, '')
          .replace(/,\s*-\d{4}/g, '')
          .replace(/\s*\[.*?\]/g, '')
          .split('; ')
          .map(name => name.split(', ').reverse().join(' ').trim())
          .join(', ');
      }
    } catch (e) {}
    
    // Build display
    const excerptdText = formatExcerptText(text);
    const sourceText = bookAuthor ? `${bookTitle}, ${bookAuthor}` : bookTitle;
    
    // Curl uses exact bytes from API response
    const gutenbergUrl = `https://www.gutenberg.org/cache/epub/${params.bookId}/pg${params.bookId}.txt`;
    const curlCmd = `curl -s -r ${byteStart}-${byteEnd} "${gutenbergUrl}"`;
    
    $('content').innerHTML = `
      <div class="excerpt-excerpt">${processItalics(excerptdText)}</div>
      <div class="excerpt-source">${escapeHtml(sourceText)}</div>
      <div class="excerpt-cmd" data-cmd="${escapeHtml(curlCmd)}">
        <span class="cmd-text">${escapeHtml(curlCmd)}</span>
        <button class="copy-btn">Copy?</button>
      </div>
    `;
    
    // Copy button handler
    $('content').querySelectorAll('.excerpt-cmd .copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cmd = btn.parentElement.dataset.cmd;
        try {
          await navigator.clipboard.writeText(cmd);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy?';
            btn.classList.remove('copied');
          }, 2000);
        } catch (e) {
          btn.textContent = 'Failed';
          setTimeout(() => { btn.textContent = 'Copy?'; }, 2000);
        }
      });
    });
    
    document.title = `${bookTitle} — Gutex`;
    
  } catch (err) {
    $('content').textContent = `Error loading text: ${err.message}`;
  }
}

$('excerptBtn').addEventListener('click', (e) => {
  e.target.blur();
  openExcerptView();
});

// ========== P2P Reading Rooms System ==========
// Uses WebSocket relay for simplicity - no WebRTC needed for text state
// Model: everyone in a room shares state and sees everyone else (opt-out by leaving)
const P2P_ROOM_KEY = 'gutex_p2p_room';

const p2p = {
  ws: null,
  peerId: null,
  roomId: null,
  roomName: null,
  peers: new Map(), // peerId -> peer info
  streams: new Map(), // peerId -> stream PIP element
  hiddenPeers: new Set(), // peers the user has explicitly hidden/closed
  expandedPips: [], // z-index ordering for expanded PIPs
  broadcastInterval: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectTimeout: null,
  isLeaving: false, // Guard against race conditions during leave
  joiningRoom: false // Flag to track if we're actively joining
};

// Room persistence - shared with landing page
function saveP2PRoom(roomId, displayName) {
  try {
    localStorage.setItem(P2P_ROOM_KEY, JSON.stringify({
      roomId: roomId,
      displayName: displayName,
      timestamp: Date.now()
    }));
  } catch (e) {}
}

function loadSavedP2PRoom() {
  try {
    const saved = localStorage.getItem(P2P_ROOM_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved);
    // Expire after 4 hours
    if (Date.now() - data.timestamp > 4 * 60 * 60 * 1000) {
      localStorage.removeItem(P2P_ROOM_KEY);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function clearSavedP2PRoom() {
  try {
    localStorage.removeItem(P2P_ROOM_KEY);
  } catch (e) {}
}

// P2P UI element shortcuts
const p2pUI = {
  toggle: () => $('p2pToggle'),
  panel: () => $('p2pPanel'),
  status: () => $('p2pStatus'),
  statusDot: () => $('p2pStatusDot'),
  statusText: () => $('p2pStatusText'),
  joinSection: () => $('p2pJoinSection'),
  createSection: () => $('p2pCreateSection'),
  roomSection: () => $('p2pRoomSection'),
  peersSection: () => $('p2pPeersSection'),
  roomCodeDisplay: () => $('p2pRoomCodeDisplay'),
  roomCodeInput: () => $('p2pRoomCodeInput'),
  displayName: () => $('p2pDisplayName'),
  peerList: () => $('p2pPeerList'),
  peerCount: () => $('p2pPeerCount'),
  streamsContainer: () => $('p2pStreamsContainer')
};

// Initialize P2P signaling connection
function initP2PSignaling() {
  // Close existing connection if any
  if (p2p.ws && p2p.ws.readyState === WebSocket.CONNECTING) {
    return; // Already connecting
  }
  if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) {
    return; // Already connected
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/signaling`;
  
  try {
    p2p.ws = new WebSocket(wsUrl);
  
  p2p.ws.onopen = () => {
    p2pLog('p2p_connect', 'Connected to signaling server');
    updateP2PStatus('connected', 'Connected');
    p2p.reconnectAttempts = 0; // Reset on successful connection
    
    // Auto-rejoin saved room from landing page or previous session
    if (!p2p.roomId) {
      const saved = loadSavedP2PRoom();
      if (saved && saved.roomId) {
        p2pUI.displayName().value = saved.displayName || '';
        joinP2PRoom(saved.roomId, saved.displayName);
      }
    }
  };
  
  p2p.ws.onclose = () => {
    p2pLog('p2p_disconnect', 'Disconnected from signaling server');
    updateP2PStatus('disconnected', 'Disconnected');
    p2p.roomId = null;
    p2p.peers.clear();
    updateP2PUI();
    
    // Exponential backoff reconnect (3s, 6s, 12s, 24s, 48s, then stop)
    if (p2p.reconnectAttempts < p2p.maxReconnectAttempts) {
      const delay = 3000 * Math.pow(2, p2p.reconnectAttempts);
      p2p.reconnectAttempts++;
      p2pLog('p2p', `Reconnecting in ${delay/1000}s (attempt ${p2p.reconnectAttempts})`);
      p2p.reconnectTimeout = setTimeout(initP2PSignaling, delay);
    } else {
      p2pLog('p2p_error', 'Max reconnect attempts reached, giving up');
    }
  };
  
  p2p.ws.onerror = (err) => {
    p2pLog('p2p_error', 'WebSocket error');
  };
  
  p2p.ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleP2PMessage(message);
    } catch (err) {
      p2pLog('p2p_error', 'Failed to parse message');
    }
  };
  } catch (err) {
    p2pLog('p2p_error', 'Failed to create WebSocket connection');
  }
}

function sendP2PMessage(message) {
  if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) {
    p2p.ws.send(JSON.stringify(message));
  }
}

function handleP2PMessage(message) {
  // Block room-related messages if we're in the process of leaving
  if (p2p.isLeaving) {
    return;
  }
  
  switch (message.type) {
    case 'peer-list':
      // Ignore peer updates if we're not in a room
      if (!p2p.roomId) return;
      if (message.payload?.yourId) {
        p2p.peerId = message.payload.yourId;
      }
      if (message.payload?.peers) {
        updatePeerList(message.payload.peers);
      }
      if (message.payload?.action === 'joined') {
        p2pLog('p2p_peer', `Peer joined: ${message.payload.peer?.displayName || 'unknown'}`);
      }
      if (message.payload?.action === 'left') {
        p2pLog('p2p_peer', `Peer left: ${message.payload.peerId}`);
        // Remove their PIP
        removeStreamPIP(message.payload.peerId);
      }
      break;
      
    case 'room-info':
      // Only process if we're actively joining a room (prevents stale messages after leaving)
      if (!p2p.joiningRoom) {
        p2pLog('p2p', 'Ignoring room-info - not actively joining');
        break;
      }
      p2p.joiningRoom = false;
      
      p2p.roomId = message.roomId;
      p2p.peerId = message.peerId;
      // Save room for persistence across pages
      saveP2PRoom(p2p.roomId, p2pUI.displayName()?.value || '');
      if (message.payload?.room) {
        p2p.roomName = message.payload.room.name;
        if (message.payload.room.peers) {
          updatePeerList(message.payload.room.peers);
          // Auto-show PIPs for all other peers
          message.payload.room.peers.forEach(peer => {
            if (peer.id !== p2p.peerId && !p2p.streams.has(peer.id)) {
              createStreamPIP(peer.id);
            }
          });
        }
      }
      // Auto-start sharing when joining any room
      startSharing();
      updateP2PUI();
      break;
      
    case 'stream-state':
      handleP2PStreamState(message);
      break;
      
    case 'error':
      p2p.joiningRoom = false; // Clear joining flag on error
      p2pLog('p2p_error', message.payload?.message || 'Unknown error');
      // Clear saved room if it no longer exists (stale room from previous session)
      if (message.payload?.message?.includes('not found')) {
        clearSavedP2PRoom();
        // Don't show hint - this is expected for stale rooms and auto-recovers
      } else {
        showHint(message.payload?.message || 'P2P Error');
      }
      break;
  }
}

function updateP2PStatus(status, text) {
  p2pUI.statusDot().classList.remove('connected', 'broadcasting');
  p2pUI.toggle().classList.remove('connected', 'broadcasting');
  
  if (status === 'connected' || status === 'broadcasting') {
    p2pUI.statusDot().classList.add(status);
    p2pUI.toggle().classList.add(status);
  }
  p2pUI.statusText().textContent = text;
}

function updateP2PUI() {
  const inRoom = !!p2p.roomId;
  
  // Show/hide sections based on state
  const nameSection = $('p2pNameSection');
  if (nameSection) nameSection.style.display = inRoom ? 'none' : 'block';
  p2pUI.joinSection().style.display = inRoom ? 'none' : 'block';
  p2pUI.createSection().style.display = inRoom ? 'none' : 'block';
  p2pUI.roomSection().style.display = inRoom ? 'block' : 'none';
  p2pUI.peersSection().style.display = inRoom ? 'block' : 'none';
  
  if (inRoom) {
    p2pUI.roomCodeDisplay().textContent = p2p.roomId;
    updateP2PStatus('connected', `In room ${p2p.roomId}`);
  } else {
    updateP2PStatus('connected', 'Not in a room');
  }
}

function updatePeerList(peers) {
  p2p.peers.clear();
  peers.forEach(peer => {
    p2p.peers.set(peer.id, peer);
  });
  
  p2pUI.peerCount().textContent = p2p.peers.size;
  
  const listEl = p2pUI.peerList();
  listEl.innerHTML = '';
  
  p2p.peers.forEach((peer, peerId) => {
    const item = document.createElement('li');
    item.className = 'p2p-peer-item';
    
    const isYou = peerId === p2p.peerId;
    
    let badges = '';
    if (isYou) badges += '<span class="peer-badge you">You</span>';
    
    // Hide button to close this peer's PIP
    const hideBtn = !isYou && p2p.streams.has(peerId) ? 
      `<button class="hide-btn" data-peer-id="${peerId}" style="padding:2px 8px;font-size:10px;background:#f0f0f0;border:1px solid #ccc;border-radius:3px;cursor:pointer;">Hide</button>` : '';
    
    item.innerHTML = `
      <div class="peer-info">
        <span>${escapeHtml(peer.displayName)}</span>
        ${badges}
      </div>
      ${hideBtn}
    `;
    
    listEl.appendChild(item);
  });
  
  // Add hide button handlers
  listEl.querySelectorAll('.hide-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const peerId = btn.dataset.peerId;
      removeStreamPIP(peerId);
      btn.remove();
    });
  });
}

// Sharing functions - everyone in a room automatically shares state
function startSharing() {
  if (p2p.broadcastInterval) return; // Already sharing
  
  // Start sharing state periodically via WebSocket
  shareState();
  p2p.broadcastInterval = setInterval(shareState, 250);
  
  p2pLog('p2p', 'Started sharing');
}

function stopSharing() {
  if (p2p.broadcastInterval) {
    clearInterval(p2p.broadcastInterval);
    p2p.broadcastInterval = null;
  }
  
  p2pLog('p2p', 'Stopped sharing');
}

function shareState() {
  if (!p2p.roomId) return;
  
  const streamState = {
    type: 'reading',
    bookId: state.bookId,
    bookTitle: state.bookTitle,
    bookAuthor: state.bookAuthor,
    byteStart: state.byteStart,
    byteEnd: state.byteEnd,
    chunkSize: state.chunkSize,
    percent: $('percent')?.textContent || '0%',
    mode: rope3d.active ? '3d' : '2d',
    timestamp: Date.now()
  };
  
  // In 3D mode, include visible words
  if (rope3d.active && rope3d.allWords.length > 0) {
    const cfg = rope3d.config;
    const visibleWordCount = Math.ceil(cfg.FAR_CLIP / cfg.WORD_SPACING) + 5;
    const startWord = Math.max(0, Math.floor(rope3d.wordOffset) - 3);
    const endWord = Math.min(rope3d.allWords.length - 1, startWord + visibleWordCount);
    
    const visibleWords = [];
    for (let i = startWord; i <= endWord && visibleWords.length < 50; i++) {
      if (rope3d.allWords[i]) visibleWords.push(rope3d.allWords[i]);
    }
    streamState.visibleWords = visibleWords;
    streamState.wordOffset = rope3d.wordOffset;
  } else {
    // 2D mode - get current text
    const content = $('content')?.textContent || '';
    streamState.text = content.slice(0, 500);
  }
  
  sendP2PMessage({
    type: 'stream-state',
    payload: streamState
  });
}

function handleP2PStreamState(message) {
  const peerId = message.peerId;
  const streamState = message.payload;
  
  // Ignore our own messages
  if (peerId === p2p.peerId) return;
  
  if (!peerId || !streamState) return;
  
  // Don't process stream states if we're not in a room or leaving
  if (!p2p.roomId || p2p.isLeaving) return;
  
  // Don't create PIP for peers the user has explicitly hidden
  if (p2p.hiddenPeers.has(peerId)) return;
  
  // Create PIP for this peer if we don't have one yet
  if (!p2p.streams.has(peerId)) {
    createStreamPIP(peerId);
  }
  
  // Handle search-type states (from landing page)
  if (streamState.type === 'search') {
    updateStreamPIPSearch(peerId, streamState);
    return;
  }
  
  // Update their PIP window with reading state
  updateStreamPIP(peerId, streamState);
}

function updateStreamPIPSearch(peerId, searchState) {
  const pip = p2p.streams.get(peerId);
  if (!pip) return;
  
  const contentEl = pip.querySelector(`#pip-content-${peerId}`);
  const canvasEl = pip.querySelector(`#pip-canvas-${peerId}`);
  const modeEl = pip.querySelector(`#pip-mode-${peerId}`);
  if (!contentEl) return;
  
  // Hide canvas for search view
  if (canvasEl) canvasEl.style.display = 'none';
  stopPIPCanvas(peerId);
  
  // Update mode indicator
  if (modeEl) {
    modeEl.textContent = '🔍';
    modeEl.style.color = '#3b82f6';
  }
  
  contentEl.style.display = 'block';
  contentEl.style.minHeight = '120px';
  
  const peer = p2p.peers.get(peerId);
  const peerName = peer?.displayName || 'Peer';
  
  let html = `<div style="font-size:11px;color:#888;margin-bottom:6px;padding:0 8px;">${escapeHtml(peerName)} is searching${searchState.isTyping ? '...' : ''}</div>`;
  
  if (searchState.query) {
    html += `<div style="padding:4px 8px;background:rgba(59,130,246,0.1);border-left:2px solid #3b82f6;margin:0 8px 8px;font-style:italic;">${escapeHtml(searchState.query)}</div>`;
  }
  
  if (searchState.results && searchState.results.length > 0) {
    html += '<div style="padding:0 8px;font-size:12px;">';
    searchState.results.slice(0, 3).forEach(book => {
      html += `<div style="padding:2px 0;"><a href="/read#${book.id}" style="color:#3b82f6;text-decoration:none;">#${book.id} ${escapeHtml(book.title)}</a></div>`;
    });
    if (searchState.results.length > 3) {
      html += `<div style="color:#888;">+${searchState.results.length - 3} more</div>`;
    }
    html += '</div>';
  } else if (searchState.query && searchState.query.length >= 2) {
    html += '<div style="padding:0 8px;color:#888;font-size:12px;font-style:italic;">No results</div>';
  }
  
  contentEl.innerHTML = html;
}

// Picture-in-Picture stream management
// Store canvas state per PIP
const pipCanvasState = new Map(); // peerId -> { animationId, words, offset }

function createStreamPIP(peerId) {
  if (p2p.streams.has(peerId)) return;
  
  const peer = p2p.peers.get(peerId);
  const container = p2pUI.streamsContainer();
  container.classList.add('active');
  
  const pip = document.createElement('div');
  pip.className = 'p2p-stream-pip';
  pip.id = `pip-${peerId}`;
  pip.style.cssText = 'right: 20px; bottom: 100px; width: 320px;';
  
  pip.innerHTML = `
    <div class="pip-header">
      <button class="pip-expand" data-peer-id="${peerId}" title="Expand to fullscreen">⤢</button>
      <span class="pip-title">${escapeHtml(peer?.displayName || 'Peer')}</span>
      <span class="pip-mode" id="pip-mode-${peerId}" style="font-size:10px;color:#888;margin-left:8px;">2D</span>
      <div class="pip-controls">
        <button class="pip-collapse" data-peer-id="${peerId}" title="Collapse/Expand">▼</button>
        <button class="pip-close" data-peer-id="${peerId}" title="Close">✕</button>
      </div>
    </div>
    <div class="pip-content" id="pip-content-${peerId}" style="min-height:120px;">
      <div style="color:#888;font-style:italic;">Waiting for stream...</div>
    </div>
    <canvas id="pip-canvas-${peerId}" width="640" height="300" style="display:none;width:100%;height:150px;background:#0a0a0a;border-radius:0 0 8px 8px;"></canvas>
  `;
  
  container.appendChild(pip);
  p2p.streams.set(peerId, pip);
  
  // Add expand handler - toggles fullscreen mode
  const expandBtn = pip.querySelector('.pip-expand');
  expandBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  expandBtn.addEventListener('touchstart', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, { capture: true, passive: false });
  expandBtn.addEventListener('touchend', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    // Trigger the expand logic
    expandBtn.click();
  }, { capture: true, passive: false });
  expandBtn.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    const isExpanded = pip.classList.contains('expanded');
    const canvas = pip.querySelector(`#pip-canvas-${peerId}`);
    
    if (isExpanded) {
      // Minimize - remove from expanded list
      pip.classList.remove('expanded');
      pip.style.zIndex = '';
      const idx = p2p.expandedPips.indexOf(peerId);
      if (idx > -1) p2p.expandedPips.splice(idx, 1);
      // Reset canvas to small size
      if (canvas) {
        canvas.width = 640;
        canvas.height = 300;
      }
    } else {
      // Expand - add to front of expanded list and set highest z-index
      pip.classList.add('expanded');
      pip.classList.remove('collapsed');
      // Remove from list if already there, then add to front
      const idx = p2p.expandedPips.indexOf(peerId);
      if (idx > -1) p2p.expandedPips.splice(idx, 1);
      p2p.expandedPips.push(peerId);
      // Update z-indices: most recent gets highest
      p2p.expandedPips.forEach((pid, i) => {
        const el = p2p.streams.get(pid);
        if (el && el.classList.contains('expanded')) {
          el.style.zIndex = 10000 + i;
        }
      });
      // Resize canvas buffer for expanded view after layout settles
      if (canvas) {
        setTimeout(() => {
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = rect.height * (window.devicePixelRatio || 1);
          }
        }, 50);
      }
    }
  }, true);
  
  // Add collapse handler
  const collapseBtn = pip.querySelector('.pip-collapse');
  collapseBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  collapseBtn.addEventListener('touchstart', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, { capture: true, passive: false });
  collapseBtn.addEventListener('touchend', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    collapseBtn.click();
  }, { capture: true, passive: false });
  collapseBtn.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    // If expanded, don't collapse - just minimize first
    if (pip.classList.contains('expanded')) {
      pip.classList.remove('expanded');
      pip.style.zIndex = '';
      const idx = p2p.expandedPips.indexOf(peerId);
      if (idx > -1) p2p.expandedPips.splice(idx, 1);
      return;
    }
    pip.classList.toggle('collapsed');
    const collapseBtn = pip.querySelector('.pip-collapse');
    if (pip.classList.contains('collapsed')) {
      collapseBtn.textContent = '▲';
      collapseBtn.title = 'Expand';
    } else {
      collapseBtn.textContent = '▼';
      collapseBtn.title = 'Collapse';
    }
  }, true);
  
  // Add close handler - leaves the room entirely (use capture to fire before drag handlers)
  const closeBtn = pip.querySelector('.pip-close');
  closeBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  closeBtn.addEventListener('touchstart', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, { capture: true, passive: false });
  closeBtn.addEventListener('touchend', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    leaveP2PRoom();
  }, { capture: true, passive: false });
  closeBtn.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    leaveP2PRoom();
  }, true);
  
  // Make draggable (with touch support for mobile)
  makeDraggable(pip, pip.querySelector('.pip-header'));
  
  p2pLog('p2p_follow', `Created PIP for ${peer?.displayName || peerId}`);
}

function removeStreamPIP(peerId) {
  // Clean up canvas animation if exists
  const canvasState = pipCanvasState.get(peerId);
  if (canvasState && canvasState.animationId) {
    cancelAnimationFrame(canvasState.animationId);
    pipCanvasState.delete(peerId);
  }
  
  const pip = p2p.streams.get(peerId);
  if (pip) {
    pip.remove();
    p2p.streams.delete(peerId);
  }
  
  if (p2p.streams.size === 0) {
    p2pUI.streamsContainer().classList.remove('active');
  }
}

function renderPIP3DCanvas(peerId, words) {
  const pip = p2p.streams.get(peerId);
  if (!pip) return;
  
  const canvas = pip.querySelector(`#pip-canvas-${peerId}`);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Get or create state
  let state = pipCanvasState.get(peerId);
  if (!state) {
    state = { animationId: null, words: [] };
    pipCanvasState.set(peerId, state);
  }
  
  // Update words
  state.words = words;
  
  // If animation not running, start it
  if (!state.animationId) {
    function animate() {
      state.animationId = requestAnimationFrame(animate);
      
      // Read dimensions each frame (may change on resize)
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      // Render words with perspective depth effect
      const centerX = width / 2;
      const centerY = height * 0.3;  // Start higher up in the canvas
      const spacing = 1.5;
      const vanishingPointZ = 20;
      
      // Scale font size based on canvas height
      const baseFont = Math.max(24, height * 0.16);
      
      state.words.forEach((word, i) => {
        // Z position (depth) - first word is closest
        const z = i * spacing + 0.5;
        
        // Perspective projection
        const scale = vanishingPointZ / (vanishingPointZ + z);
        const y = centerY + (z * height * 0.027 * scale);
        
        // Size and opacity based on depth
        const fontSize = Math.max(8, baseFont * scale);
        const opacity = Math.max(0.1, Math.min(1, 1 - z / 15));
        
        ctx.font = `${fontSize}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fillText(word, centerX, y);
      });
    }
    animate();
  }
}

function stopPIPCanvas(peerId) {
  const state = pipCanvasState.get(peerId);
  if (state && state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
  pipCanvasState.delete(peerId);
}

function updateStreamPIP(peerId, streamState) {
  const pip = p2p.streams.get(peerId);
  if (!pip) return;
  
  const contentEl = pip.querySelector(`#pip-content-${peerId}`);
  const canvasEl = pip.querySelector(`#pip-canvas-${peerId}`);
  const modeEl = pip.querySelector(`#pip-mode-${peerId}`);
  if (!contentEl || !canvasEl) return;
  
  const is3D = streamState.mode === '3d';
  
  // Toggle 3D mode class for expanded layout
  pip.classList.toggle('pip-3d-mode', is3D);
  
  // Update mode indicator
  if (modeEl) {
    modeEl.textContent = is3D ? '3D' : '2D';
    modeEl.style.color = is3D ? '#4a9' : '#888';
  }
  
  // Book info line (shown in both modes)
  const bookInfo = streamState.bookTitle 
    ? `<div style="font-size:11px;color:#888;margin-bottom:6px;padding:0 8px;">${escapeHtml(streamState.bookTitle)}${streamState.bookAuthor ? ' · ' + escapeHtml(streamState.bookAuthor) : ''} · ${streamState.percent || '0%'}</div>`
    : '';
  
  if (is3D && streamState.visibleWords && streamState.visibleWords.length > 0) {
    // 3D mode - show book info + canvas
    contentEl.innerHTML = bookInfo || '<div style="height:20px;"></div>';
    contentEl.style.display = 'block';
    contentEl.style.minHeight = 'auto';
    canvasEl.style.display = 'block';
    
    // Render words on 2D canvas with depth effect
    renderPIP3DCanvas(peerId, streamState.visibleWords);
    
  } else {
    // 2D mode - show text content, hide canvas
    contentEl.style.display = 'block';
    contentEl.style.minHeight = '120px';
    canvasEl.style.display = 'none';
    
    // Stop canvas animation
    stopPIPCanvas(peerId);
    
    let displayText = '';
    if (streamState.text) {
      displayText = streamState.text;
    } else if (streamState.visibleWords && streamState.visibleWords.length > 0) {
      displayText = streamState.visibleWords.join(' ');
    }
    
    if (!displayText && !streamState.bookTitle) return;
    
    contentEl.innerHTML = bookInfo + (displayText ? `<div style="padding:0 8px;">${processItalics(displayText)}</div>` : '<em style="color:#666;padding:0 8px;">Waiting for content...</em>');
  }
}

function makeDraggable(element, handle) {
  let isDragging = false;
  let startX, startY, startRight, startBottom;
  
  // Helper to get coordinates from mouse or touch event
  function getCoords(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }
  
  function startDrag(e) {
    // Skip if expanded (fullscreen mode)
    if (element.classList.contains('expanded')) return;
    
    // Skip if clicking on a button (close, collapse, expand) or its children
    if (e.target.closest('button')) return;
    
    isDragging = true;
    const coords = getCoords(e);
    startX = coords.x;
    startY = coords.y;
    startRight = parseInt(element.style.right) || 20;
    startBottom = parseInt(element.style.bottom) || 100;
    e.preventDefault();
  }
  
  function moveDrag(e) {
    if (!isDragging) return;
    
    const coords = getCoords(e);
    const deltaX = startX - coords.x;
    const deltaY = startY - coords.y;
    
    element.style.right = Math.max(0, startRight + deltaX) + 'px';
    element.style.bottom = Math.max(0, startBottom + deltaY) + 'px';
  }
  
  function endDrag() {
    isDragging = false;
  }
  
  // Mouse events on handle only (desktop)
  handle.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', moveDrag);
  document.addEventListener('mouseup', endDrag);
  
  // Touch events on entire element (mobile) - allows dragging from anywhere
  element.addEventListener('touchstart', startDrag, { passive: false });
  document.addEventListener('touchmove', moveDrag, { passive: false });
  document.addEventListener('touchend', endDrag);
}

// P2P UI Event Handlers
function toggleP2PPanel() {
  p2pUI.panel().classList.toggle('visible');
}

function createP2PRoom() {
  const displayName = p2pUI.displayName().value.trim() || `User ${Math.floor(Math.random() * 1000)}`;
  
  p2p.joiningRoom = true;
  sendP2PMessage({
    type: 'create-room',
    payload: {
      displayName,
      name: `${displayName}'s Room`
    }
  });
  p2pLog('p2p', `Creating room as "${displayName}"`);
}

function joinP2PRoom(roomCodeArg, displayNameArg) {
  // Handle case where event object is passed from click handler
  let roomCode = '';
  if (typeof roomCodeArg === 'string') {
    roomCode = roomCodeArg.trim().toUpperCase();
  } else {
    const input = p2pUI.roomCodeInput();
    if (input && input.value) {
      roomCode = String(input.value).trim().toUpperCase();
    }
  }
  
  let displayName = '';
  if (typeof displayNameArg === 'string') {
    displayName = displayNameArg.trim();
  } else {
    const input = p2pUI.displayName();
    if (input && input.value) {
      displayName = String(input.value).trim();
    }
  }
  if (!displayName) {
    displayName = `User ${Math.floor(Math.random() * 1000)}`;
  }
  
  if (!roomCode || roomCode.length < 4) {
    showHint('Enter a valid room code');
    return;
  }
  
  p2p.joiningRoom = true;
  sendP2PMessage({
    type: 'join-room',
    roomId: roomCode,
    payload: { displayName }
  });
  p2pLog('p2p', `Joining room ${roomCode} as "${displayName}"`);
}

function leaveP2PRoom() {
  // Prevent double-execution
  if (p2p.isLeaving) return;
  
  // Confirm if there are other peers in the room
  if (p2p.peers.size > 1) {
    if (!confirm('Leave this room?\nAll your Reading Room connections will close.')) {
      return;
    }
  }
  
  p2p.isLeaving = true;
  p2p.joiningRoom = false; // Cancel any pending join
  
  // Set roomId null FIRST to prevent race conditions with incoming stream-state messages
  const wasRoomId = p2p.roomId;
  p2p.roomId = null;
  
  // Clear streams
  p2p.streams.forEach((pip, peerId) => {
    removeStreamPIP(peerId);
  });
  
  // Stop sharing
  stopSharing();
  
  if (wasRoomId) {
    sendP2PMessage({ type: 'leave-room' });
    p2pLog('p2p', 'Left room');
  }
  
  p2p.peers.clear();
  p2p.hiddenPeers.clear();
  p2p.expandedPips = [];
  clearSavedP2PRoom();
  updateP2PUI();
  
  p2p.isLeaving = false;
}

function copyP2PRoomCode() {
  navigator.clipboard.writeText(p2p.roomId).then(() => {
    $('p2pCopyCode').textContent = 'Copied!';
    setTimeout(() => {
      $('p2pCopyCode').textContent = 'Copy Code';
    }, 2000);
  });
}

// Initialize P2P UI event listeners
$('p2pToggle').addEventListener('click', toggleP2PPanel);
$('p2pClose').addEventListener('click', () => p2pUI.panel().classList.remove('visible'));
$('p2pCreateBtn').addEventListener('click', createP2PRoom);
$('p2pJoinBtn').addEventListener('click', joinP2PRoom);
$('p2pLeaveBtn').addEventListener('click', leaveP2PRoom);
$('p2pCopyCode').addEventListener('click', copyP2PRoomCode);

// Handle Enter key in room code input
$('p2pRoomCodeInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinP2PRoom();
});

// Initialize P2P signaling on page load
setTimeout(initP2PSignaling, 500);

// Load bookmarks from browser storage
loadBookmarksFromStorage();

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
