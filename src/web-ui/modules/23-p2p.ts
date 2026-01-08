// @ts-nocheck
// ========== P2P Reading Rooms System ==========
// Uses WebSocket relay for simplicity - no WebRTC needed for text state
// Model: everyone in a room shares state and sees everyone else (opt-out by leaving)
const P2P_ROOM_KEY = 'gutex_p2p_room';

const p2p = {
  ws: null,
  peerId: null,
  roomId: null,
  roomName: null,
  peers: new Map(), // peerId -> peer info
  streams: new Map(), // peerId -> stream PIP element
  hiddenPeers: new Set(), // peers the user has explicitly hidden/closed
  expandedPips: [], // z-index ordering for expanded PIPs
  broadcastInterval: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectTimeout: null,
  isLeaving: false, // Guard against race conditions during leave
  joiningRoom: false // Flag to track if we're actively joining
};

// Room persistence - shared with landing page
function saveP2PRoom(roomId, displayName) {
  try {
    localStorage.setItem(P2P_ROOM_KEY, JSON.stringify({
      roomId: roomId,
      displayName: displayName,
      timestamp: Date.now()
    }));
  } catch (e) {}
}

function loadSavedP2PRoom() {
  try {
    const saved = localStorage.getItem(P2P_ROOM_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved);
    // Expire after 4 hours
    if (Date.now() - data.timestamp > 4 * 60 * 60 * 1000) {
      localStorage.removeItem(P2P_ROOM_KEY);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function clearSavedP2PRoom() {
  try {
    localStorage.removeItem(P2P_ROOM_KEY);
  } catch (e) {}
}

// P2P UI element shortcuts
const p2pUI = {
  toggle: () => $('p2pToggle'),
  panel: () => $('p2pPanel'),
  status: () => $('p2pStatus'),
  statusDot: () => $('p2pStatusDot'),
  statusText: () => $('p2pStatusText'),
  joinSection: () => $('p2pJoinSection'),
  createSection: () => $('p2pCreateSection'),
  roomSection: () => $('p2pRoomSection'),
  peersSection: () => $('p2pPeersSection'),
  roomCodeDisplay: () => $('p2pRoomCodeDisplay'),
  roomCodeInput: () => $('p2pRoomCodeInput'),
  displayName: () => $('p2pDisplayName'),
  peerList: () => $('p2pPeerList'),
  peerCount: () => $('p2pPeerCount'),
  streamsContainer: () => $('p2pStreamsContainer')
};

// Initialize P2P signaling connection
function initP2PSignaling() {
  // Close existing connection if any
  if (p2p.ws && p2p.ws.readyState === WebSocket.CONNECTING) {
    return; // Already connecting
  }
  if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) {
    return; // Already connected
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/signaling`;
  
  try {
    p2p.ws = new WebSocket(wsUrl);
  
  p2p.ws.onopen = () => {
    p2pLog('p2p_connect', 'Connected to signaling server');
    updateP2PStatus('connected', 'Connected');
    p2p.reconnectAttempts = 0; // Reset on successful connection
    
    // Auto-rejoin saved room from landing page or previous session
    if (!p2p.roomId) {
      const saved = loadSavedP2PRoom();
      if (saved && saved.roomId) {
        p2pUI.displayName().value = saved.displayName || '';
        joinP2PRoom(saved.roomId, saved.displayName);
      }
    }
  };
  
  p2p.ws.onclose = () => {
    p2pLog('p2p_disconnect', 'Disconnected from signaling server');
    updateP2PStatus('disconnected', 'Disconnected');
    p2p.roomId = null;
    p2p.peers.clear();
    updateP2PUI();
    
    // Exponential backoff reconnect (3s, 6s, 12s, 24s, 48s, then stop)
    if (p2p.reconnectAttempts < p2p.maxReconnectAttempts) {
      const delay = 3000 * Math.pow(2, p2p.reconnectAttempts);
      p2p.reconnectAttempts++;
      p2pLog('p2p', `Reconnecting in ${delay/1000}s (attempt ${p2p.reconnectAttempts})`);
      p2p.reconnectTimeout = setTimeout(initP2PSignaling, delay);
    } else {
      p2pLog('p2p_error', 'Max reconnect attempts reached, giving up');
    }
  };
  
  p2p.ws.onerror = (err) => {
    p2pLog('p2p_error', 'WebSocket error');
  };
  
  p2p.ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleP2PMessage(message);
    } catch (err) {
      p2pLog('p2p_error', `Message handling error: ${err.message || 'Unknown'}`);
    }
  };
  } catch (err) {
    p2pLog('p2p_error', 'Failed to create WebSocket connection');
  }
}

function sendP2PMessage(message) {
  if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) {
    p2p.ws.send(JSON.stringify(message));
  }
}

function handleP2PMessage(message) {
  // Block room-related messages if we're in the process of leaving
  if (p2p.isLeaving) {
    return;
  }
  
  switch (message.type) {
    case 'peer-list':
      // Ignore peer updates if we're not in a room
      if (!p2p.roomId) return;
      if (message.payload?.yourId) {
        p2p.peerId = message.payload.yourId;
      }
      if (message.payload?.peers) {
        updatePeerList(message.payload.peers);
      }
      if (message.payload?.action === 'joined') {
        p2pLog('p2p_peer', `Peer joined: ${message.payload.peer?.displayName || 'unknown'}`);
      }
      if (message.payload?.action === 'left') {
        p2pLog('p2p_peer', `Peer left: ${message.payload.peerId}`);
        // Remove their PIP
        removeStreamPIP(message.payload.peerId);
      }
      break;
      
    case 'room-info':
      // Only process if we're actively joining a room (prevents stale messages after leaving)
      if (!p2p.joiningRoom) {
        p2pLog('p2p', 'Ignoring room-info - not actively joining');
        break;
      }
      p2p.joiningRoom = false;
      
      p2p.roomId = message.roomId;
      p2p.peerId = message.peerId;
      // Save room for persistence across pages
      saveP2PRoom(p2p.roomId, p2pUI.displayName()?.value || '');
      if (message.payload?.room) {
        p2p.roomName = message.payload.room.name;
        if (message.payload.room.peers) {
          updatePeerList(message.payload.room.peers);
          // Auto-show PIPs for all other peers
          message.payload.room.peers.forEach(peer => {
            if (peer.id !== p2p.peerId && !p2p.streams.has(peer.id)) {
              createStreamPIP(peer.id);
            }
          });
        }
      }
      // Auto-start sharing when joining any room
      startSharing();
      updateP2PUI();
      break;
      
    case 'stream-state':
      handleP2PStreamState(message);
      break;
      
    case 'error':
      p2p.joiningRoom = false; // Clear joining flag on error
      p2pLog('p2p_error', message.payload?.message || 'Unknown error');
      // Clear saved room if it no longer exists (stale room from previous session)
      if (message.payload?.message?.includes('not found')) {
        clearSavedP2PRoom();
        // Don't show hint - this is expected for stale rooms and auto-recovers
      } else {
        showHint(message.payload?.message || 'P2P Error');
      }
      break;
  }
}

function updateP2PStatus(status, text) {
  p2pUI.statusDot().classList.remove('connected', 'broadcasting');
  p2pUI.toggle().classList.remove('connected', 'broadcasting');
  
  if (status === 'connected' || status === 'broadcasting') {
    p2pUI.statusDot().classList.add(status);
    p2pUI.toggle().classList.add(status);
  }
  p2pUI.statusText().textContent = text;
}

function updateP2PUI() {
  const inRoom = !!p2p.roomId;
  
  // Show/hide sections based on state
  const nameSection = $('p2pNameSection');
  if (nameSection) nameSection.style.display = inRoom ? 'none' : 'block';
  p2pUI.joinSection().style.display = inRoom ? 'none' : 'block';
  p2pUI.createSection().style.display = inRoom ? 'none' : 'block';
  p2pUI.roomSection().style.display = inRoom ? 'block' : 'none';
  p2pUI.peersSection().style.display = inRoom ? 'block' : 'none';
  
  if (inRoom) {
    p2pUI.roomCodeDisplay().textContent = p2p.roomId;
    updateP2PStatus('connected', `In room ${p2p.roomId}`);
  } else {
    updateP2PStatus('connected', 'Not in a room');
  }
}

function updatePeerList(peers) {
  p2p.peers.clear();
  peers.forEach(peer => {
    p2p.peers.set(peer.id, peer);
  });
  
  p2pUI.peerCount().textContent = p2p.peers.size;
  
  const listEl = p2pUI.peerList();
  listEl.innerHTML = '';
  
  p2p.peers.forEach((peer, peerId) => {
    const item = document.createElement('li');
    item.className = 'p2p-peer-item';
    
    const isYou = peerId === p2p.peerId;
    const isHidden = p2p.hiddenPeers.has(peerId);
    
    let badges = '';
    if (isYou) badges += '<span class="peer-badge you">You</span>';
    
    // Show Hide button for visible peers, Show button for hidden peers
    let actionBtn = '';
    if (!isYou) {
      if (isHidden) {
        actionBtn = `<button class="show-btn" data-peer-id="${peerId}" style="padding:2px 8px;font-size:10px;background:#e8f5e9;border:1px solid #4caf50;border-radius:3px;cursor:pointer;color:#2e7d32;">Show</button>`;
      } else if (p2p.streams.has(peerId)) {
        actionBtn = `<button class="hide-btn" data-peer-id="${peerId}" style="padding:2px 8px;font-size:10px;background:#f0f0f0;border:1px solid #ccc;border-radius:3px;cursor:pointer;">Hide</button>`;
      }
    }
    
    item.innerHTML = `
      <div class="peer-info">
        <span>${escapeHtml(peer.displayName)}${isHidden ? ' <span style="color:#888;font-size:10px;">(hidden)</span>' : ''}</span>
        ${badges}
      </div>
      ${actionBtn}
    `;
    
    listEl.appendChild(item);
  });
  
  // Add hide button handlers
  listEl.querySelectorAll('.hide-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const peerId = btn.dataset.peerId;
      p2p.hiddenPeers.add(peerId);  // Mark peer as hidden so PIP won't be recreated
      removeStreamPIP(peerId);
      updatePeerList(Array.from(p2p.peers.values()));  // Refresh to show Show button
    });
  });
  
  // Add show button handlers to unhide peers
  listEl.querySelectorAll('.show-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const peerId = btn.dataset.peerId;
      p2p.hiddenPeers.delete(peerId);  // Remove from hidden set
      createStreamPIP(peerId);  // Create the PIP immediately
      updatePeerList(Array.from(p2p.peers.values()));  // Refresh to show Hide button
    });
  });
}

// Sharing functions - everyone in a room automatically shares state
function startSharing() {
  if (p2p.broadcastInterval) return; // Already sharing
  
  // Start sharing state periodically via WebSocket
  shareState();
  p2p.broadcastInterval = setInterval(shareState, 250);
  
  p2pLog('p2p', 'Started sharing');
}

function stopSharing() {
  if (p2p.broadcastInterval) {
    clearInterval(p2p.broadcastInterval);
    p2p.broadcastInterval = null;
  }
  
  p2pLog('p2p', 'Stopped sharing');
}

function shareState() {
  if (!p2p.roomId) return;
  
  const streamState = {
    type: 'reading',
    bookId: state.bookId,
    bookTitle: state.bookTitle,
    bookAuthor: state.bookAuthor,
    byteStart: state.byteStart,
    byteEnd: state.byteEnd,
    chunkSize: state.chunkSize,
    percent: $('percent')?.textContent || '0%',
    mode: rope3d.active ? '3d' : '2d',
    timestamp: Date.now()
  };
  
  // In 3D mode, include visible words
  if (rope3d.active && rope3d.allWords.length > 0) {
    const cfg = rope3d.config;
    const visibleWordCount = Math.ceil(cfg.FAR_CLIP / cfg.WORD_SPACING) + 5;
    const startWord = Math.max(0, Math.floor(rope3d.wordOffset) - 3);
    const endWord = Math.min(rope3d.allWords.length - 1, startWord + visibleWordCount);
    
    const visibleWords = [];
    for (let i = startWord; i <= endWord && visibleWords.length < 50; i++) {
      if (rope3d.allWords[i]) visibleWords.push(rope3d.allWords[i]);
    }
    streamState.visibleWords = visibleWords;
    streamState.wordOffset = rope3d.wordOffset;
  } else {
    // 2D mode - get current text (full viewport content, no truncation)
    // Use innerHTML and replace br tags to avoid word concatenation
    const contentHtml = $('content')?.innerHTML || '';
    const contentWithSpaces = contentHtml.replace(/<br\s*\/?>/gi, ' ');
    const temp = document.createElement('div');
    temp.innerHTML = contentWithSpaces;
    const content = temp.textContent || '';
    streamState.text = content;
  }
  
  sendP2PMessage({
    type: 'stream-state',
    payload: streamState
  });
}

function handleP2PStreamState(message) {
  const peerId = message.peerId;
  const streamState = message.payload;
  
  // Ignore our own messages
  if (peerId === p2p.peerId) return;
  
  if (!peerId || !streamState) return;
  
  // Don't process stream states if we're not in a room or leaving
  if (!p2p.roomId || p2p.isLeaving) return;
  
  // Don't create PIP for peers the user has explicitly hidden
  if (p2p.hiddenPeers.has(peerId)) return;
  
  // Create PIP for this peer if we don't have one yet
  if (!p2p.streams.has(peerId)) {
    createStreamPIP(peerId);
  }
  
  // Handle search-type states (from landing page)
  if (streamState.type === 'search') {
    updateStreamPIPSearch(peerId, streamState);
    return;
  }
  
  // Update their PIP window with reading state
  updateStreamPIP(peerId, streamState);
}

function updateStreamPIPSearch(peerId, searchState) {
  const pip = p2p.streams.get(peerId);
  if (!pip) return;
  
  const contentEl = pip.querySelector(`#pip-content-${peerId}`);
  const canvasEl = pip.querySelector(`#pip-canvas-${peerId}`);
  const modeEl = pip.querySelector(`#pip-mode-${peerId}`);
  if (!contentEl) return;
  
  // Hide canvas for search view
  if (canvasEl) canvasEl.style.display = 'none';
  stopPIPCanvas(peerId);
  
  // Update mode indicator
  if (modeEl) {
    modeEl.textContent = '🔍';
    modeEl.style.color = '#3b82f6';
  }
  
  contentEl.style.display = 'block';
  contentEl.style.minHeight = '120px';
  
  const peer = p2p.peers.get(peerId);
  const peerName = peer?.displayName || 'Peer';
  
  let html = `<div style="font-size:11px;color:#888;margin-bottom:6px;padding:0 8px;">${escapeHtml(peerName)} is searching${searchState.isTyping ? '...' : ''}</div>`;
  
  if (searchState.query) {
    html += `<div style="padding:4px 8px;background:rgba(59,130,246,0.1);border-left:2px solid #3b82f6;margin:0 8px 8px;font-style:italic;">${escapeHtml(searchState.query)}</div>`;
  }
  
  if (searchState.results && searchState.results.length > 0) {
    html += '<div style="padding:0 8px;font-size:12px;">';
    searchState.results.slice(0, 3).forEach(book => {
      html += `<div style="padding:2px 0;"><a href="/read#${book.id}" style="color:#3b82f6;text-decoration:none;">#${book.id} ${escapeHtml(book.title)}</a></div>`;
    });
    if (searchState.results.length > 3) {
      html += `<div style="color:#888;">+${searchState.results.length - 3} more</div>`;
    }
    html += '</div>';
  } else if (searchState.query && searchState.query.length >= 2) {
    html += '<div style="padding:0 8px;color:#888;font-size:12px;font-style:italic;">No results</div>';
  }
  
  contentEl.innerHTML = html;
}

// Picture-in-Picture stream management
// Store canvas state per PIP
const pipCanvasState = new Map(); // peerId -> { animationId, words, offset }

function createStreamPIP(peerId) {
  if (p2p.streams.has(peerId)) return;
  
  const peer = p2p.peers.get(peerId);
  const container = p2pUI.streamsContainer();
  container.classList.add('active');
  
  const pip = document.createElement('div');
  pip.className = 'p2p-stream-pip';
  pip.id = `pip-${peerId}`;
  pip.style.cssText = 'right: 20px; bottom: 100px; width: 320px;';
  
  pip.innerHTML = `
    <div class="pip-header">
      <button class="pip-expand" data-peer-id="${peerId}" title="Expand to fullscreen">⤢</button>
      <span class="pip-title">${escapeHtml(peer?.displayName || 'Peer')}</span>
      <span class="pip-mode" id="pip-mode-${peerId}" style="font-size:10px;color:#888;margin-left:8px;">2D</span>
      <div class="pip-controls">
        <button class="pip-collapse" data-peer-id="${peerId}" title="Collapse/Expand">▼</button>
        <button class="pip-close" data-peer-id="${peerId}" title="Close">✕</button>
      </div>
    </div>
    <div class="pip-content" id="pip-content-${peerId}" style="min-height:120px;">
      <div style="color:#888;font-style:italic;">Waiting for stream...</div>
    </div>
    <canvas id="pip-canvas-${peerId}" width="640" height="300" style="display:none;width:100%;height:150px;background:#0a0a0a;border-radius:0 0 8px 8px;"></canvas>
  `;
  
  container.appendChild(pip);
  p2p.streams.set(peerId, pip);
  
  // Add expand handler - toggles fullscreen mode
  const expandBtn = pip.querySelector('.pip-expand');
  expandBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  expandBtn.addEventListener('touchstart', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, { capture: true, passive: false });
  expandBtn.addEventListener('touchend', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    // Trigger the expand logic
    expandBtn.click();
  }, { capture: true, passive: false });
  expandBtn.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    const isExpanded = pip.classList.contains('expanded');
    const canvas = pip.querySelector(`#pip-canvas-${peerId}`);
    
    if (isExpanded) {
      // Minimize - remove from expanded list
      pip.classList.remove('expanded');
      pip.style.zIndex = '';
      const idx = p2p.expandedPips.indexOf(peerId);
      if (idx > -1) p2p.expandedPips.splice(idx, 1);
      // Reset canvas to small size
      if (canvas) {
        canvas.width = 640;
        canvas.height = 300;
      }
    } else {
      // Expand - add to front of expanded list and set highest z-index
      pip.classList.add('expanded');
      pip.classList.remove('collapsed');
      // Remove from list if already there, then add to front
      const idx = p2p.expandedPips.indexOf(peerId);
      if (idx > -1) p2p.expandedPips.splice(idx, 1);
      p2p.expandedPips.push(peerId);
      // Update z-indices: most recent gets highest
      p2p.expandedPips.forEach((pid, i) => {
        const el = p2p.streams.get(pid);
        if (el && el.classList.contains('expanded')) {
          el.style.zIndex = 10000 + i;
        }
      });
      // Resize canvas buffer for expanded view after layout settles
      if (canvas) {
        setTimeout(() => {
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = rect.height * (window.devicePixelRatio || 1);
          }
        }, 50);
      }
    }
  }, true);
  
  // Add collapse handler
  const collapseBtn = pip.querySelector('.pip-collapse');
  collapseBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  collapseBtn.addEventListener('touchstart', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, { capture: true, passive: false });
  collapseBtn.addEventListener('touchend', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    collapseBtn.click();
  }, { capture: true, passive: false });
  collapseBtn.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    // If expanded, don't collapse - just minimize first
    if (pip.classList.contains('expanded')) {
      pip.classList.remove('expanded');
      pip.style.zIndex = '';
      const idx = p2p.expandedPips.indexOf(peerId);
      if (idx > -1) p2p.expandedPips.splice(idx, 1);
      return;
    }
    pip.classList.toggle('collapsed');
    const collapseBtn = pip.querySelector('.pip-collapse');
    if (pip.classList.contains('collapsed')) {
      collapseBtn.textContent = '▲';
      collapseBtn.title = 'Expand';
    } else {
      collapseBtn.textContent = '▼';
      collapseBtn.title = 'Collapse';
    }
  }, true);
  
  // Add close handler - leaves the room entirely (use capture to fire before drag handlers)
  const closeBtn = pip.querySelector('.pip-close');
  closeBtn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  closeBtn.addEventListener('touchstart', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
  }, { capture: true, passive: false });
  closeBtn.addEventListener('touchend', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    leaveP2PRoom();
  }, { capture: true, passive: false });
  closeBtn.addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    leaveP2PRoom();
  }, true);
  
  // Make draggable (with touch support for mobile)
  makeDraggable(pip, pip.querySelector('.pip-header'));
  
  p2pLog('p2p_follow', `Created PIP for ${peer?.displayName || peerId}`);
}

function removeStreamPIP(peerId) {
  // Clean up canvas animation if exists
  const canvasState = pipCanvasState.get(peerId);
  if (canvasState && canvasState.animationId) {
    cancelAnimationFrame(canvasState.animationId);
    pipCanvasState.delete(peerId);
  }
  
  const pip = p2p.streams.get(peerId);
  if (pip) {
    pip.remove();
    p2p.streams.delete(peerId);
  }
  
  if (p2p.streams.size === 0) {
    p2pUI.streamsContainer().classList.remove('active');
  }
}

function renderPIP3DCanvas(peerId, words) {
  const pip = p2p.streams.get(peerId);
  if (!pip) return;
  
  const canvas = pip.querySelector(`#pip-canvas-${peerId}`);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Get or create state
  let state = pipCanvasState.get(peerId);
  if (!state) {
    state = { animationId: null, words: [] };
    pipCanvasState.set(peerId, state);
  }
  
  // Update words
  state.words = words;
  
  // If animation not running, start it
  if (!state.animationId) {
    function animate() {
      state.animationId = requestAnimationFrame(animate);
      
      // Read dimensions each frame (may change on resize)
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
      
      // Render words with perspective depth effect
      const centerX = width / 2;
      const centerY = height * 0.3;  // Start higher up in the canvas
      const spacing = 1.5;
      const vanishingPointZ = 20;
      
      // Scale font size based on canvas height
      const baseFont = Math.max(24, height * 0.16);
      
      state.words.forEach((word, i) => {
        // Z position (depth) - first word is closest
        const z = i * spacing + 0.5;
        
        // Perspective projection
        const scale = vanishingPointZ / (vanishingPointZ + z);
        const y = centerY + (z * height * 0.027 * scale);
        
        // Size and opacity based on depth
        const fontSize = Math.max(8, baseFont * scale);
        const opacity = Math.max(0.1, Math.min(1, 1 - z / 15));
        
        ctx.font = `${fontSize}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fillText(word, centerX, y);
      });
    }
    animate();
  }
}

function stopPIPCanvas(peerId) {
  const state = pipCanvasState.get(peerId);
  if (state && state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
  pipCanvasState.delete(peerId);
}

function updateStreamPIP(peerId, streamState) {
  const pip = p2p.streams.get(peerId);
  if (!pip) return;
  
  const contentEl = pip.querySelector(`#pip-content-${peerId}`);
  const canvasEl = pip.querySelector(`#pip-canvas-${peerId}`);
  const modeEl = pip.querySelector(`#pip-mode-${peerId}`);
  if (!contentEl || !canvasEl) return;
  
  const is3D = streamState.mode === '3d';
  
  // Toggle 3D mode class for expanded layout
  pip.classList.toggle('pip-3d-mode', is3D);
  
  // Update mode indicator
  if (modeEl) {
    modeEl.textContent = is3D ? '3D' : '2D';
    modeEl.style.color = is3D ? '#4a9' : '#888';
  }
  
  // Book info line (shown in both modes)
  const bookInfo = streamState.bookTitle 
    ? `<div style="font-size:11px;color:#888;margin-bottom:6px;padding:0 8px;">${escapeHtml(streamState.bookTitle)}${streamState.bookAuthor ? ' · ' + escapeHtml(streamState.bookAuthor) : ''} · ${streamState.percent || '0%'}</div>`
    : '';
  
  if (is3D && streamState.visibleWords && streamState.visibleWords.length > 0) {
    // 3D mode - show book info + canvas
    contentEl.innerHTML = bookInfo || '<div style="height:20px;"></div>';
    contentEl.style.display = 'block';
    contentEl.style.minHeight = 'auto';
    canvasEl.style.display = 'block';
    
    // Render words on 2D canvas with depth effect
    renderPIP3DCanvas(peerId, streamState.visibleWords);
    
  } else {
    // 2D mode - show text content, hide canvas
    contentEl.style.display = 'block';
    contentEl.style.minHeight = '120px';
    canvasEl.style.display = 'none';
    
    // Stop canvas animation
    stopPIPCanvas(peerId);
    
    let displayText = '';
    if (streamState.text) {
      displayText = streamState.text;
    } else if (streamState.visibleWords && streamState.visibleWords.length > 0) {
      displayText = streamState.visibleWords.join(' ');
    }
    
    // Always update content - show waiting message if nothing else to display
    contentEl.innerHTML = bookInfo + (displayText ? `<div style="padding:0 8px;">${processItalics(displayText)}</div>` : '<em style="color:#666;padding:0 8px;">Waiting for content...</em>');
  }
}

function makeDraggable(element, handle) {
  let isDragging = false;
  let startX, startY, startRight, startBottom;
  
  // Helper to get coordinates from mouse or touch event
  function getCoords(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }
  
  function startDrag(e) {
    // Skip if expanded (fullscreen mode)
    if (element.classList.contains('expanded')) return;
    
    // Skip if clicking on a button (close, collapse, expand) or its children
    if (e.target.closest('button')) return;
    
    isDragging = true;
    const coords = getCoords(e);
    startX = coords.x;
    startY = coords.y;
    startRight = parseInt(element.style.right) || 20;
    startBottom = parseInt(element.style.bottom) || 100;
    e.preventDefault();
  }
  
  function moveDrag(e) {
    if (!isDragging) return;
    
    const coords = getCoords(e);
    const deltaX = startX - coords.x;
    const deltaY = startY - coords.y;
    
    element.style.right = Math.max(0, startRight + deltaX) + 'px';
    element.style.bottom = Math.max(0, startBottom + deltaY) + 'px';
  }
  
  function endDrag() {
    isDragging = false;
  }
  
  // Mouse events on handle only (desktop)
  handle.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', moveDrag);
  document.addEventListener('mouseup', endDrag);
  
  // Touch events on entire element (mobile) - allows dragging from anywhere
  element.addEventListener('touchstart', startDrag, { passive: false });
  document.addEventListener('touchmove', moveDrag, { passive: false });
  document.addEventListener('touchend', endDrag);
}

// P2P UI Event Handlers
function toggleP2PPanel() {
  p2pUI.panel().classList.toggle('visible');
}

function createP2PRoom() {
  const displayName = p2pUI.displayName().value.trim() || `User ${Math.floor(Math.random() * 1000)}`;
  
  p2p.joiningRoom = true;
  sendP2PMessage({
    type: 'create-room',
    payload: {
      displayName,
      name: `${displayName}'s Room`
    }
  });
  p2pLog('p2p', `Creating room as "${displayName}"`);
}

function joinP2PRoom(roomCodeArg, displayNameArg) {
  // Handle case where event object is passed from click handler
  let roomCode = '';
  if (typeof roomCodeArg === 'string') {
    roomCode = roomCodeArg.trim().toUpperCase();
  } else {
    const input = p2pUI.roomCodeInput();
    if (input && input.value) {
      roomCode = String(input.value).trim().toUpperCase();
    }
  }
  
  let displayName = '';
  if (typeof displayNameArg === 'string') {
    displayName = displayNameArg.trim();
  } else {
    const input = p2pUI.displayName();
    if (input && input.value) {
      displayName = String(input.value).trim();
    }
  }
  if (!displayName) {
    displayName = `User ${Math.floor(Math.random() * 1000)}`;
  }
  
  if (!roomCode || roomCode.length < 4) {
    showHint('Enter a valid room code');
    return;
  }
  
  p2p.joiningRoom = true;
  sendP2PMessage({
    type: 'join-room',
    roomId: roomCode,
    payload: { displayName }
  });
  p2pLog('p2p', `Joining room ${roomCode} as "${displayName}"`);
}

function leaveP2PRoom() {
  // Prevent double-execution
  if (p2p.isLeaving) return;
  
  // Confirm if there are other peers in the room
  if (p2p.peers.size > 1) {
    if (!confirm('Leave this room?\nAll your Reading Room connections will close.')) {
      return;
    }
  }
  
  p2p.isLeaving = true;
  p2p.joiningRoom = false; // Cancel any pending join
  
  // Set roomId null FIRST to prevent race conditions with incoming stream-state messages
  const wasRoomId = p2p.roomId;
  p2p.roomId = null;
  
  // Clear streams
  p2p.streams.forEach((pip, peerId) => {
    removeStreamPIP(peerId);
  });
  
  // Stop sharing
  stopSharing();
  
  if (wasRoomId) {
    sendP2PMessage({ type: 'leave-room' });
    p2pLog('p2p', 'Left room');
  }
  
  p2p.peers.clear();
  p2p.hiddenPeers.clear();
  p2p.expandedPips = [];
  clearSavedP2PRoom();
  updateP2PUI();
  
  p2p.isLeaving = false;
}

function copyP2PRoomCode() {
  navigator.clipboard.writeText(p2p.roomId).then(() => {
    $('p2pCopyCode').textContent = 'Copied!';
    setTimeout(() => {
      $('p2pCopyCode').textContent = 'Copy Code';
    }, 2000);
  });
}

// Initialize P2P UI event listeners
$('p2pToggle').addEventListener('click', toggleP2PPanel);
$('p2pClose').addEventListener('click', () => p2pUI.panel().classList.remove('visible'));
$('p2pCreateBtn').addEventListener('click', createP2PRoom);
$('p2pJoinBtn').addEventListener('click', joinP2PRoom);
$('p2pLeaveBtn').addEventListener('click', leaveP2PRoom);
$('p2pCopyCode').addEventListener('click', copyP2PRoomCode);

// Handle Enter key in room code input
$('p2pRoomCodeInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinP2PRoom();
});

// Initialize P2P signaling on page load (but not in excerpt mode)
if (!isExcerptMode()) {
  setTimeout(initP2PSignaling, 500);
}

// Load bookmarks from browser storage
loadBookmarksFromStorage();
