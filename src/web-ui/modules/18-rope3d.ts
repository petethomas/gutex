// @ts-nocheck
// ========== 3D Rope Mode ==========

// Helper to get text from content element, properly handling <br> tags
// Without this, <br> becomes nothing (not a space) in textContent, causing word concatenation
function getContentText() {
  const contentHtml = $('content').innerHTML || '';
  const contentWithSpaces = contentHtml.replace(/<br\s*\/?>/gi, ' ');
  const temp = document.createElement('div');
  temp.innerHTML = contentWithSpaces;
  return temp.textContent || '';
}

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
    
    // Primary sweeping curves - VERY broad and gentle
    CURVE_AMPLITUDE_X: 400,    // Moderate horizontal drift
    CURVE_AMPLITUDE_Y: 250,    // Gentle vertical motion
    CURVE_PERIOD_X: 120,       // 120 words per horizontal sweep - very slow!
    CURVE_PERIOD_Y: 90,        // 90 words per vertical wave - gentle hills
    
    // Secondary curves - subtle variation only
    CURVE2_AMPLITUDE_X: 150,
    CURVE2_AMPLITUDE_Y: 100,
    CURVE2_PERIOD_X: 200,      // Very long wavelength
    CURVE2_PERIOD_Y: 160,
    
    // Loop-de-loop parameters - disabled by default (very subtle if enabled)
    LOOP_AMPLITUDE: 0,         // Set to 0 to disable loops entirely
    LOOP_PERIOD: 300,          // Very rare if enabled
    LOOP_TIGHTNESS: 80,        // 80 words per revolution - extremely gentle
    LOOP_VERTICAL_SCALE: 0.5,  // Shallow ellipse
    
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

// Roller coaster spline: broad sweeping curves, butter smooth
// Uses smoothstep blending for gentle transitions
function ropePathPosition(t) {
  const cfg = rope3d.config;
  
  // Smoothstep function for gentler wave shapes
  // Creates softer peaks and valleys than raw sin()
  const smoothWave = (theta) => {
    // Normalize sin to 0-1 range, apply smoothstep, then back to -1 to 1
    const normalized = (Math.sin(theta) + 1) / 2;
    // Smoothstep: 3x² - 2x³ creates gentler transitions
    const smoothed = normalized * normalized * (3 - 2 * normalized);
    return smoothed * 2 - 1;
  };
  
  // Primary curves - broad, gentle sweeps
  const theta1X = (t / cfg.CURVE_PERIOD_X) * Math.PI * 2;
  const theta1Y = (t / cfg.CURVE_PERIOD_Y) * Math.PI * 2;
  
  // Secondary curves - very subtle variation
  const theta2X = (t / cfg.CURVE2_PERIOD_X) * Math.PI * 2;
  const theta2Y = (t / cfg.CURVE2_PERIOD_Y) * Math.PI * 2;
  
  // Use smoothed waves for primary motion, raw sin for subtle secondary
  let x = smoothWave(theta1X) * cfg.CURVE_AMPLITUDE_X +
          Math.sin(theta2X) * cfg.CURVE2_AMPLITUDE_X;
  let y = smoothWave(theta1Y) * cfg.CURVE_AMPLITUDE_Y +
          Math.sin(theta2Y + Math.PI / 4) * cfg.CURVE2_AMPLITUDE_Y;  // Phase offset for variety
  
  // Optional gentle loops (only if LOOP_AMPLITUDE > 0)
  if (cfg.LOOP_AMPLITUDE > 0) {
    const loopPhase = (t / cfg.LOOP_PERIOD) * Math.PI * 2;
    // Very smooth activation using smoothstep of smoothstep
    const rawActivation = Math.max(0, Math.sin(loopPhase));
    const loopActivation = rawActivation * rawActivation * rawActivation; // Cubic for extra smoothness
    
    if (loopActivation > 0.001) {
      const loopT = (t / cfg.LOOP_TIGHTNESS) * Math.PI * 2;
      x += Math.sin(loopT) * cfg.LOOP_AMPLITUDE * loopActivation;
      y += (Math.cos(loopT) - 1) * cfg.LOOP_AMPLITUDE * cfg.LOOP_VERTICAL_SCALE * loopActivation;
    }
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
    const content = getContentText();
    const words = tokenizeForRope(content);
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

// Sync rope position to state (without URL update)
function updateRopeToState() {
  if (!rope3d.active || rope3d.allWords.length === 0) return;
  
  // Use tracked viewBytePosition for accurate state
  state.byteStart = Math.max(0, Math.floor(rope3d.viewBytePosition));
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
    const words = tokenizeForRope(newText);
    setRopeWords(words);
    rope3d.wordOffset = 0;
    rope3d.firstByteStart = data.byteStart;
    rope3d.lastByteEnd = data.byteEnd;
    rope3d.viewBytePosition = data.byteStart; // Reset to chunk start
    rope3d.backwardHistory = [...navHistoryStack];
    
    if (rope3d.allWords.length > 0) {
      rope3d.bytesPerWord = (data.byteEnd - data.byteStart) / rope3d.allWords.length;
    }
    
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
          const words = tokenizeForRope(newText);
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
      const newWords = tokenizeForRope(newText);
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
      const newWords = tokenizeForRope(newText);
      
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
  
  const content = getContentText();
  const newWords = tokenizeForRope(content);
  
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
  
  const content = getContentText();
  const words = tokenizeForRope(content);
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
