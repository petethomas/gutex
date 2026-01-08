// @ts-nocheck
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
    initBook(state.bookId, state.byteStart, chunkSize, false, false);
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
