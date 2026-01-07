// @ts-nocheck
// ========== Network latency tracking ==========
const latencyTracker = {
  samples: [],
  maxSamples: 5,

  record(ms) {
    this.samples.push(ms);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  },

  getAverage() {
    if (this.samples.length === 0) return 500;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  },

  getP90() {
    if (this.samples.length === 0) return 1000;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.9);
    return sorted[Math.min(idx, sorted.length - 1)];
  }
};

function adjustIntervalOptions() {
  const p90 = latencyTracker.getP90();
  const minSafeInterval = Math.ceil(p90 / 1000);
  const select = $('autoInterval');

  // Mark options that might be too fast (but don't disable - let user choose)
  let adjusted = false;
  Array.from(select.options).forEach(opt => {
    const val = parseInt(opt.value, 10);
    if (val < minSafeInterval) {
      opt.textContent = opt.textContent.replace(/ \(slow\)$/, '') + ' (slow)';
      adjusted = true;
    } else {
      opt.textContent = opt.textContent.replace(/ \(slow\)$/, '');
    }
  });

  select.classList.toggle('adjusted', adjusted);
}
