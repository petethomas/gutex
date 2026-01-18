// @ts-nocheck
// ========== Mobile detection & hardening ==========
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
  || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);

if (isMobile) {
  document.body.classList.add('is-mobile');
  
  // Prevent context menu on long-press for buttons
  document.addEventListener('contextmenu', (e: MouseEvent) => {
    if ((e.target as Element).closest('button, a, .results li')) {
      e.preventDefault();
    }
  });

  // Prevent double-tap zoom on interactive elements
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e: TouchEvent) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300 && (e.target as Element).closest('button, a, input')) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
}
