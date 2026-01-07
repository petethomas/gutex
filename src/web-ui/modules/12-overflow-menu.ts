// @ts-nocheck
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
