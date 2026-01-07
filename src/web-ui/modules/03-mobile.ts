// @ts-nocheck
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

// ========== Pinch-to-Zoom Prevention ==========
// Prevent iOS Safari pinch-zoom via gesturestart/gesturechange events
document.addEventListener('gesturestart', function(e) {
  e.preventDefault();
}, { passive: false });

document.addEventListener('gesturechange', function(e) {
  e.preventDefault();
}, { passive: false });

document.addEventListener('gestureend', function(e) {
  e.preventDefault();
}, { passive: false });

// Prevent pinch-zoom via touch events (handles 2+ finger touches)
let lastTouchCount = 0;
document.addEventListener('touchstart', function(e) {
  lastTouchCount = e.touches.length;
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('touchmove', function(e) {
  // Prevent zoom when multiple fingers are touching
  if (e.touches.length > 1) {
    e.preventDefault();
  }
  // Also prevent if we started with multiple fingers
  if (lastTouchCount > 1) {
    e.preventDefault();
  }
}, { passive: false });

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
