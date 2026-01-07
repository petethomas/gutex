// @ts-nocheck
// ========== Theme Management ==========
function initTheme() {
  // Check URL parameter first (for excerpt mode)
  const urlParams = new URLSearchParams(window.location.search);
  const urlTheme = urlParams.get('theme');
  const savedTheme = urlTheme || localStorage.getItem('gutex-theme') || 'default';
  applyTheme(savedTheme);
  const select = document.getElementById('themeSelect');
  if (select) select.value = savedTheme;
  
  // Load saved language preference into search language selector
  const savedLanguage = localStorage.getItem('gutex-language') || 'en';
  const searchLangSelect = document.getElementById('searchLanguage');
  if (searchLangSelect) searchLangSelect.value = savedLanguage;
  
  // Sync overflow menu theme select
  const overflowTheme = document.getElementById('overflowTheme');
  if (overflowTheme) overflowTheme.value = savedTheme;
}

function applyTheme(theme) {
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('gutex-theme', theme);
  
  // Update 3D canvas if active (safely check for rope3d)
  try {
    if (rope3d && rope3d.active) {
      requestAnimationFrame(() => renderRopeFrame());
    }
  } catch (e) {
    // rope3d not yet initialized, ignore
  }
}

const THEMES = ['default', 'dark', 'scifi', 'greenfield', 'stoneworks', 'redbrick', 'midnight', 'amber'];
const THEME_NAMES = {
  'default': 'Default',
  'dark': 'Dark',
  'scifi': 'Sci-Fi',
  'greenfield': 'Greenfield',
  'stoneworks': 'Stoneworks',
  'redbrick': 'Redbrick',
  'midnight': 'Midnight',
  'amber': 'Amber'
};

function cycleTheme() {
  const current = localStorage.getItem('gutex-theme') || 'default';
  const currentIndex = THEMES.indexOf(current);
  const nextIndex = (currentIndex + 1) % THEMES.length;
  const nextTheme = THEMES[nextIndex];
  
  applyTheme(nextTheme);
  
  // Update dropdowns
  const select = document.getElementById('themeSelect');
  if (select) select.value = nextTheme;
  const overflowTheme = document.getElementById('overflowTheme');
  if (overflowTheme) overflowTheme.value = nextTheme;
  
  // Show hint
  showHint(`Theme: ${THEME_NAMES[nextTheme]}`, 1000);
}

// Initialize theme immediately to prevent flash
initTheme();
