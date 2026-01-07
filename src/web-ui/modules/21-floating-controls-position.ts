// @ts-nocheck
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
