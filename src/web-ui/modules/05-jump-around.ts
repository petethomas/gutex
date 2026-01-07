// @ts-nocheck
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
        const words = tokenizeForRope(newText);
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
