// @ts-nocheck
// ========== Text Size ==========
const TEXT_SIZES = {
  'small': 0.875,
  'normal': 1,
  'large': 1.15
};
const TEXT_SIZE_NAMES = {
  'small': 'Small text',
  'normal': 'Normal text',
  'large': 'Large text'
};

function initTextSize() {
  const savedSize = localStorage.getItem('gutex-text-size') || 'normal';
  applyTextSize(savedSize);
  
  const select = document.getElementById('textSizeSelect');
  if (select) select.value = savedSize;
  
  const overflowSelect = document.getElementById('overflowTextSize');
  if (overflowSelect) overflowSelect.value = savedSize;
}

function applyTextSize(size) {
  const scale = TEXT_SIZES[size] || 1;
  // Set CSS custom property for non-content elements
  document.documentElement.style.setProperty('--text-scale', String(scale));
  
  // Use body classes for #content font-size (more stable on iOS)
  document.body.classList.remove('text-size-small', 'text-size-normal', 'text-size-large');
  document.body.classList.add(`text-size-${size}`);
  
  localStorage.setItem('gutex-text-size', size);
}

function cycleTextSize() {
  const sizes = Object.keys(TEXT_SIZES);
  const current = localStorage.getItem('gutex-text-size') || 'normal';
  const currentIndex = sizes.indexOf(current);
  const nextIndex = (currentIndex + 1) % sizes.length;
  const nextSize = sizes[nextIndex];
  
  applyTextSize(nextSize);
  
  // Update dropdowns
  const select = document.getElementById('textSizeSelect');
  if (select) select.value = nextSize;
  const overflowSelect = document.getElementById('overflowTextSize');
  if (overflowSelect) overflowSelect.value = nextSize;
  
  showHint(`${TEXT_SIZE_NAMES[nextSize]}`, 1000);
}

// Initialize text size immediately to prevent flash
initTextSize();
