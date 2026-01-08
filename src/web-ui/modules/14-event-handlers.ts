// @ts-nocheck
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
          if (rope3d.active) {
            reloadRopeWithChunkSize(size);
          } else {
            initBook(state.bookId, state.byteStart, size, false, false);
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
      
      if (rope3d.active) {
        // In 3D mode: reload rope with new chunk size
        reloadRopeWithChunkSize(newChunkSize);
      } else {
        initBook(state.bookId, state.byteStart, newChunkSize, false, false);
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
      
      // Fade back in
      fadeCanvas(1, 100);
    } else if (rope3d.active && !data) {
      // initBook failed but we're in 3D - sync from whatever content is there
      syncRopeFromContent();
      fadeCanvas(1, 100);
    }
  }
});
