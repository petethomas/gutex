// @ts-nocheck
// ========== Theme initialization ==========
function initTheme(): void {
  const savedTheme = localStorage.getItem('gutex-theme') || 'default';
  if (savedTheme !== 'default') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
}

// Apply theme immediately to prevent flash
initTheme();
