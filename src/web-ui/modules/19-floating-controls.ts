// @ts-nocheck
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
