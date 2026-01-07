// @ts-nocheck
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
