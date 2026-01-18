// @ts-nocheck
// ========== Excerpt mode ==========
// Simple: use same API as main UI, curl uses byteStart/byteEnd from response

function isExcerptMode() {
  return window.location.search.includes('excerpt=1');
}

function openExcerptView() {
  // CRITICAL: Use state values to ensure excerpt shows what's displayed
  const base = window.location.origin + window.location.pathname;
  const currentTheme = localStorage.getItem('gutex-theme') || 'default';
  const currentByte = rope3d.active ? Math.floor(rope3d.viewBytePosition) : state.byteStart;
  const hash = `#${state.bookId},${currentByte},${state.chunkSize}`;
  window.open(`${base}?excerpt=1&theme=${currentTheme}${hash}`, '_blank');
}

function formatExcerptText(text) {
  // Replace double excerpts with single excerpts (since we wrap in double excerpts)
  let formatted = text.trim().replace(/"/g, "'");
  
  const startsWithCapital = /^[A-Z]/.test(formatted);
  const endsWithPunctuation = /[.!?;:,'"')\]]$/.test(formatted);
  
  const leftEllipsis = startsWithCapital ? '' : '… ';
  const rightEllipsis = endsWithPunctuation ? '' : ' …';
  
  return '"' + leftEllipsis + formatted + rightEllipsis + '"';
}

async function initExcerptMode() {
  document.body.classList.add('excerpt-mode');
  $('content').textContent = 'Loading...';
  
  // Add subtle home link in lower left
  const homeLink = document.createElement('a');
  homeLink.href = '/';
  homeLink.className = 'excerpt-home-link';
  homeLink.textContent = 'gutex';
  document.body.appendChild(homeLink);
  
  const params = parseHash();
  if (!params) {
    $('content').textContent = 'No book specified.';
    return;
  }
  
  try {
    // Fetch EXACT bytes for excerpt (not word-aligned)
    const exactRes = await fetch(
      `/api/book/${params.bookId}/chunk?byteStart=${params.byteStart}&chunkSize=${params.chunkSize}&exact=1`
    );
    const exactData = await exactRes.json();
    if (!exactData || !exactData.text) throw new Error('No content returned');
    
    const text = exactData.text;
    const byteStart = exactData.byteStart;
    const byteEnd = exactData.byteEnd;
    
    // Fetch book info
    let bookTitle = `Book ${params.bookId}`;
    let bookAuthor = '';
    try {
      const infoRes = await fetch(`/api/bookinfo/${params.bookId}`);
      const info = await infoRes.json();
      if (info.title) bookTitle = info.title;
      if (info.author) {
        bookAuthor = info.author
          .replace(/,\s*\d{4}-\d{4}/g, '')
          .replace(/,\s*\d{4}-/g, '')
          .replace(/,\s*-\d{4}/g, '')
          .replace(/\s*\[.*?\]/g, '')
          .split('; ')
          .map(name => name.split(', ').reverse().join(' ').trim())
          .join(', ');
      }
    } catch (e) {}
    
    // Build display
    const excerptdText = formatExcerptText(text);
    const sourceText = bookAuthor ? `${bookTitle}, ${bookAuthor}` : bookTitle;
    
    // Curl uses exact bytes from API response
    const gutenbergUrl = `https://www.gutenberg.org/cache/epub/${params.bookId}/pg${params.bookId}.txt`;
    const curlCmd = `curl -s -r ${byteStart}-${byteEnd} "${gutenbergUrl}"`;
    
    $('content').innerHTML = `
      <div class="excerpt-excerpt">${processItalics(excerptdText)}</div>
      <div class="excerpt-source">${escapeHtml(sourceText)}</div>
      <div class="excerpt-cmd" data-cmd="${escapeHtml(curlCmd)}">
        <span class="cmd-text">${escapeHtml(curlCmd)}</span>
        <button class="copy-btn">Copy?</button>
      </div>
    `;
    
    // Copy button handler
    $('content').querySelectorAll('.excerpt-cmd .copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cmd = btn.parentElement.dataset.cmd;
        try {
          await navigator.clipboard.writeText(cmd);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy?';
            btn.classList.remove('copied');
          }, 2000);
        } catch (e) {
          btn.textContent = 'Failed';
          setTimeout(() => { btn.textContent = 'Copy?'; }, 2000);
        }
      });
    });
    
    document.title = `${bookTitle} — Gutex`;
    
  } catch (err) {
    $('content').textContent = `Error loading text: ${err.message}`;
  }
}

$('excerptBtn').addEventListener('click', (e) => {
  e.target.blur();
  openExcerptView();
});
