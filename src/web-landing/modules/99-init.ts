// @ts-nocheck
// ========== Initialization ==========

// Restore last search
const cached = loadSearchCache();
if (cached && cached.results && cached.results.length > 0) {
  const queryInput = $('query') as HTMLInputElement | null;
  if (queryInput) queryInput.value = cached.query || '';
  renderResults(cached.results, cached.query);
}

// Restore display name
const saved = loadSavedRoom();
if (saved && saved.displayName) {
  const displayNameInput = $('p2pDisplayName') as HTMLInputElement | null;
  if (displayNameInput) displayNameInput.value = saved.displayName;
}

// Initialize P2P
initP2PSignaling();

// Empty export to make TypeScript treat this as a module
export {};
