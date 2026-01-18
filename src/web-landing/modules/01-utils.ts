// @ts-nocheck
// ========== Utility functions ==========
const $ = (id: string): HTMLElement | null => document.getElementById(id);

const SEARCH_CACHE_KEY = 'gutex_last_search';
const P2P_ROOM_KEY = 'gutex_p2p_room';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAuthor(author: string): string {
  return author
    .replace(/,\s*\d{4}-\d{4}/g, '')
    .replace(/,\s*\d{4}-/g, '')
    .replace(/,\s*-\d{4}/g, '')
    .replace(/\s*\[.*?\]/g, '')
    .split('; ')
    .map((name: string) => name.split(', ').reverse().join(' ').trim())
    .join(', ');
}

function showHint(message: string): void {
  const existing = document.querySelector('.hint-toast');
  if (existing) existing.remove();
  
  const hint = document.createElement('div');
  hint.className = 'hint-toast';
  hint.textContent = message;
  document.body.appendChild(hint);
  
  setTimeout(() => hint.remove(), 3000);
}
