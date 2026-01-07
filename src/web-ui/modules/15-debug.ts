// @ts-nocheck
// ========== Debug panel ==========
const debug = {
  active: false,
  pollInterval: null,
  currentTab: 'events',
  clearTimestamps: { events: 0, requests: 0, mirrors: 0, p2p: 0 },
  p2pEvents: [] // Client-side P2P event log
};

// Log P2P events to debug panel (client-side only)
function p2pLog(type, message) {
  const entry = {
    timestamp: Date.now(),
    type: type,
    message: message
  };
  debug.p2pEvents.push(entry);
  // Keep last 100 events
  if (debug.p2pEvents.length > 100) {
    debug.p2pEvents.shift();
  }
  // Update display if P2P tab is active
  if (debug.active && debug.currentTab === 'p2p') {
    renderP2PDebug();
  }
}

function renderP2PDebug() {
  const filtered = debug.p2pEvents.filter(e => e.timestamp > debug.clearTimestamps.p2p);
  
  // Build status header
  const statusHtml = `
    <div style="background:#1a1a2e;padding:10px 12px;border-bottom:1px solid #333;font-size:12px;">
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <span style="color:#888;">Room: <span style="color:${p2p.roomId ? '#4ade80' : '#666'}">${p2p.roomId || 'None'}</span></span>
        <span style="color:#888;">Peers: <span style="color:#0af">${p2p.peers.size}</span></span>
        <span style="color:#888;">WS: <span style="color:${p2p.ws?.readyState === 1 ? '#4ade80' : '#f66'}">${p2p.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][p2p.ws.readyState] : 'NULL'}</span></span>
      </div>
      ${p2p.peers.size > 0 ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #333;">
          <span style="color:#666;font-size:10px;text-transform:uppercase;">Peers:</span>
          ${Array.from(p2p.peers.values()).map(peer => `
            <span style="display:inline-block;margin:2px 4px;padding:2px 8px;background:#252540;border-radius:10px;font-size:11px;">
              ${escapeHtml(peer.displayName)}${peer.id === p2p.peerId ? ' (you)' : ''}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  const eventsHtml = filtered.map(e => {
    const time = new Date(e.timestamp).toLocaleTimeString();
    return `
      <div class="debug-entry">
        <span class="time">${time}</span>
        <span class="type ${e.type}">${e.type.toUpperCase().replace('P2P_', '')}</span>
        <span class="message">${escapeHtml(e.message)}</span>
      </div>
    `;
  }).join('');
  
  $('debugP2P').innerHTML = statusHtml + (eventsHtml || '<div style="color:#666;padding:20px;">No P2P events yet</div>');
}

function toggleDebug() {
  debug.active = !debug.active;
  $('debugPanel').classList.toggle('visible', debug.active);
  $('debugToggle').classList.toggle('active', debug.active);
  document.body.classList.toggle('debug-open', debug.active);
  $('debugStatus').textContent = debug.active ? 'Live' : 'Paused';

  if (debug.active) {
    pollDebug();
    debug.pollInterval = setInterval(pollDebug, 1000);
  } else {
    if (debug.pollInterval) {
      clearInterval(debug.pollInterval);
      debug.pollInterval = null;
    }
  }
}

async function pollDebug() {
  if (!debug.active) return;

  try {
    const res = await fetch('/api/debug');
    const data = await res.json();

    // Render events tab
    if (data.events) {
      const filtered = data.events.filter(e => e.timestamp > debug.clearTimestamps.events);
      const eventsHtml = filtered.map(e => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        const duration = e.duration !== null ? `${Math.round(e.duration)}ms` : '';
        return `
          <div class="debug-entry">
            <span class="time">${time}</span>
            <span class="type ${e.type}">${e.type.toUpperCase()}</span>
            <span class="message">${escapeHtml(e.message)}</span>
            <span class="duration">${duration}</span>
          </div>
        `;
      }).join('');
      $('debugEvents').innerHTML = eventsHtml || '<div style="color:#666;padding:20px;">No events yet</div>';
    }

    // Render requests tab - now includes mirror info
    if (data.requests) {
      const filtered = data.requests.filter(r => r.timestamp > debug.clearTimestamps.requests);
      const reqHtml = filtered.map(r => {
        const time = new Date(r.timestamp).toLocaleTimeString();
        const bytes = (r.bytes / 1024).toFixed(1);
        const mirrorInfo = r.mirror ? ` via ${r.mirror}` : '';
        return `
          <div class="debug-entry">
            <span class="time">${time}</span>
            <span class="type get">GET</span>
            <span class="message">Book ${r.bookId} bytes ${r.start.toLocaleString()}–${r.end.toLocaleString()} (${bytes}KB)${mirrorInfo}</span>
            <span class="duration">${r.duration}ms</span>
          </div>
        `;
      }).join('');
      $('debugRequests').innerHTML = reqHtml || '<div style="color:#666;padding:20px;">No requests yet</div>';
    }

    // Render mirrors tab
    try {
      const mirrorsRes = await fetch('/api/mirrors');
      const mirrorsData = await mirrorsRes.json();

      if (mirrorsData.mirrors) {
        const mirrorsHtml = mirrorsData.mirrors.map((m, idx) => {
          const stats = m.stats || {};
          const total = (stats.successes || 0) + (stats.failures || 0);
          const successRate = total > 0 ? Math.round((stats.successes / total) * 100) : '-';
          const avgTime = stats.avgResponseTime ? Math.round(stats.avgResponseTime) + 'ms' : '-';
          const statusColor = total === 0 ? '#666' : (successRate >= 80 ? '#0f0' : successRate >= 50 ? '#fa0' : '#f00');

          return `
            <div class="debug-entry">
              <span class="time" style="min-width:30px">#${idx + 1}</span>
              <span class="type" style="color:${statusColor};min-width:40px">${successRate}%</span>
              <span class="message">${escapeHtml(m.provider)} (${escapeHtml(m.location)})</span>
              <span class="duration">${avgTime}</span>
            </div>
          `;
        }).join('');
        $('debugMirrors').innerHTML = `
          <div style="color:#0ff;padding:4px 0;border-bottom:1px solid #333;margin-bottom:4px">
            ${mirrorsData.mirrorCount} mirrors available
          </div>
          ${mirrorsHtml}
        `;
      }
    } catch (mirrorErr) {
      $('debugMirrors').innerHTML = '<div style="color:#666;padding:20px;">Could not fetch mirror status</div>';
    }

    // Render P2P tab (client-side data, no fetch needed)
    renderP2PDebug();
  } catch (err) {
    // Silent fail for debug polling
  }
}

// Debug tab switching
document.querySelectorAll('.debug-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const tabName = tab.dataset.tab;
    debug.currentTab = tabName;

    document.querySelectorAll('.debug-content').forEach(c => c.style.display = 'none');
    document.querySelector(`.debug-content[data-tab="${tabName}"]`).style.display = 'block';
  });
});

$('debugToggle').addEventListener('click', toggleDebug);

// Clear current debug tab
$('debugClear').addEventListener('click', () => {
  const tabName = debug.currentTab;
  debug.clearTimestamps[tabName] = Date.now();
  const content = document.querySelector(`.debug-content[data-tab="${tabName}"]`);
  if (content) {
    content.innerHTML = '<div style="color:#666;padding:20px;">Cleared</div>';
  }
});
