// @ts-nocheck
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
    initBook(state.bookId, targetByte, state.chunkSize, false, false).catch(err => {
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
