// @ts-nocheck
// ========== Context view functionality ==========

function openContextView(match: FulltextMatch): void {
  contextState.currentMatch = match;
  
  const contextWordsInput = $('contextWordsInput') as HTMLInputElement | null;
  if (contextWordsInput) {
    contextState.contextWords = parseInt(contextWordsInput.value, 10) || 100;
  }
  
  updateContextView();
  
  const overlay = $('contextOverlay');
  if (overlay) overlay.classList.add('visible');
}

function closeContextView(): void {
  const overlay = $('contextOverlay');
  if (overlay) overlay.classList.remove('visible');
}

function updateContextView(): void {
  const match = contextState.currentMatch;
  if (!match) return;
  
  const title = $('contextTitle');
  const content = $('contextContent');
  const position = $('contextPosition');
  const exactMatchEl = $('contextExactMatch') as HTMLInputElement | null;
  
  const words = fulltextState.words;
  const text = fulltextState.fullText;
  const contextWords = contextState.contextWords;
  const showExact = exactMatchEl?.checked ?? true;
  
  if (title) {
    title.textContent = fulltextState.bookTitle || 'Passage';
  }
  
  if (position) {
    position.textContent = `Word ${match.wordPosition.toLocaleString()} · Byte ${match.bytePosition.toLocaleString()}`;
  }
  
  if (content) {
    // Find the word index for the match
    const matchWordIdx = match.wordPosition;
    
    // Calculate context range
    const startWordIdx = Math.max(0, matchWordIdx - contextWords);
    const endWordIdx = Math.min(words.length, matchWordIdx + contextWords + 1);
    
    // Get words before, match, and after
    const beforeWords = words.slice(startWordIdx, matchWordIdx);
    const afterWordIdx = matchWordIdx + 1;
    
    // Find where the match ends (might span multiple words)
    let matchEndWordIdx = matchWordIdx;
    const matchLen = match.matchText.split(/\s+/).length;
    matchEndWordIdx = Math.min(words.length - 1, matchWordIdx + matchLen - 1);
    
    const matchWords = words.slice(matchWordIdx, matchEndWordIdx + 1);
    const afterWords = words.slice(matchEndWordIdx + 1, endWordIdx);
    
    const beforeText = beforeWords.join(' ');
    const matchText = showExact ? match.matchText : matchWords.join(' ');
    const afterText = afterWords.join(' ');
    
    const ellipsisBefore = startWordIdx > 0 ? '... ' : '';
    const ellipsisAfter = endWordIdx < words.length ? ' ...' : '';
    
    content.innerHTML = `
      <span class="before-text">${ellipsisBefore}${escapeHtml(beforeText)} </span><span class="match-text">${escapeHtml(matchText)}</span><span class="after-text"> ${escapeHtml(afterText)}${ellipsisAfter}</span>
    `;
  }
}

function openExcerptFromContext(): void {
  const match = contextState.currentMatch;
  if (!match || !fulltextState.bookId) return;
  
  const contextWordsInput = $('contextWordsInput') as HTMLInputElement | null;
  const contextWords = contextWordsInput ? parseInt(contextWordsInput.value, 10) : 100;
  
  // Calculate a chunk size that includes the context
  const chunkSize = Math.max(50, contextWords * 2);
  
  // Calculate byte position - use the word position to estimate
  const byteStart = match.bytePosition;
  
  // Open excerpt view in new window
  const base = window.location.origin;
  const currentTheme = localStorage.getItem('gutex-theme') || 'default';
  const hash = `#${fulltextState.bookId},${byteStart},${chunkSize}`;
  window.open(`${base}/read?excerpt=1&theme=${currentTheme}${hash}`, '_blank');
}

function readFromContext(): void {
  const match = contextState.currentMatch;
  if (!match || !fulltextState.bookId) return;
  
  // Navigate to reader at this position
  const byteStart = match.bytePosition;
  const chunkSize = 200;
  
  window.location.href = `/read#${fulltextState.bookId},${byteStart},${chunkSize}`;
}
