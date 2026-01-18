// @ts-nocheck
// ========== P2P State and Connection ==========
interface P2PState {
  ws: WebSocket | null;
  peerId: string | null;
  roomId: string | null;
  displayName: string | null;
  peers: Map<string, { displayName: string }>;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectTimeout: number | null;
  broadcastTimeout: number | null;
}

const p2p: P2PState = {
  ws: null,
  peerId: null,
  roomId: null,
  displayName: null,
  peers: new Map(),
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectTimeout: null,
  broadcastTimeout: null
};

function initP2PSignaling(): void {
  if (p2p.ws && p2p.ws.readyState === WebSocket.CONNECTING) return;
  if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) return;
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = protocol + '//' + window.location.host + '/ws/signaling';
  
  try {
    p2p.ws = new WebSocket(wsUrl);
    
    p2p.ws.onopen = () => {
      p2p.reconnectAttempts = 0;
      updateP2PStatus(true);
      
      const saved = loadSavedRoom();
      if (saved && saved.roomId) {
        setTimeout(() => joinRoom(saved.roomId, saved.displayName), 500);
      }
    };
    
    p2p.ws.onclose = () => {
      updateP2PStatus(false);
      scheduleReconnect();
    };
    
    p2p.ws.onerror = () => {
      updateP2PStatus(false);
    };
    
    p2p.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        handleP2PMessage(msg);
      } catch (e) {}
    };
  } catch (e) {
    updateP2PStatus(false);
  }
}

function scheduleReconnect(): void {
  if (p2p.reconnectAttempts >= p2p.maxReconnectAttempts) return;
  
  const delay = Math.min(1000 * Math.pow(2, p2p.reconnectAttempts), 30000);
  p2p.reconnectAttempts++;
  
  if (p2p.reconnectTimeout) clearTimeout(p2p.reconnectTimeout);
  p2p.reconnectTimeout = window.setTimeout(initP2PSignaling, delay);
}

function updateP2PStatus(connected: boolean): void {
  const dot = $('p2pStatusDot');
  const text = $('p2pStatusText');
  const toggle = $('p2pToggle');
  
  if (dot) dot.classList.toggle('connected', connected);
  if (text) text.textContent = connected ? 'Connected' : 'Connecting...';
  if (toggle) toggle.classList.toggle('connected', connected);
}

function sendP2PMessage(msg: object): void {
  if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) {
    p2p.ws.send(JSON.stringify(msg));
  }
}

function handleP2PMessage(msg: { type: string; peerId?: string; roomId?: string; peers?: Array<{ peerId: string; displayName: string }>; payload?: any }): void {
  switch (msg.type) {
    case 'welcome':
      p2p.peerId = msg.peerId || null;
      break;
      
    case 'room-created':
    case 'room-joined':
      p2p.roomId = msg.roomId || null;
      if (msg.peers) {
        p2p.peers.clear();
        msg.peers.forEach(peer => {
          if (peer.peerId !== p2p.peerId) {
            p2p.peers.set(peer.peerId, { displayName: peer.displayName || 'Anonymous' });
          }
        });
      }
      saveRoom(msg.roomId || '', p2p.displayName || '');
      updateRoomUI();
      break;
      
    case 'peer-joined':
      if (msg.peerId && msg.peerId !== p2p.peerId) {
        p2p.peers.set(msg.peerId, { displayName: msg.payload?.displayName || 'Anonymous' });
        updateRoomUI();
      }
      break;
      
    case 'peer-left':
      if (msg.peerId) {
        p2p.peers.delete(msg.peerId);
        updateRoomUI();
      }
      break;
      
    case 'stream-state':
      handlePeerState(msg.peerId || '', msg.payload);
      break;
      
    case 'error':
      showHint(msg.payload?.message || 'P2P error');
      break;
  }
}

function handlePeerState(peerId: string, payload: any): void {
  if (!payload) return;
  
  const activity = $('peerActivity');
  const nameEl = $('peerActivityName');
  const contentEl = $('peerActivityContent');
  const typingEl = $('typingIndicator');
  
  if (!activity || !contentEl) return;
  
  const peer = p2p.peers.get(peerId);
  const peerName = peer?.displayName || 'Someone';
  
  if (nameEl) nameEl.textContent = peerName + ':';
  
  if (payload.type === 'search') {
    activity.classList.add('visible');
    
    if (typingEl) {
      typingEl.style.display = payload.isTyping ? 'inline-flex' : 'none';
    }
    
    if (payload.query) {
      let html = '<div class="search-query">' + escapeHtml(payload.query) + '</div>';
      
      if (payload.results && payload.results.length > 0) {
        html += '<div class="search-results">';
        payload.results.slice(0, 5).forEach((book: any) => {
          html += '<div class="result-item"><a href="/read#' + book.id + '">#' + book.id + ' ' + escapeHtml(book.title) + '</a></div>';
        });
        if (payload.results.length > 5) {
          html += '<div class="result-item">...and ' + (payload.results.length - 5) + ' more</div>';
        }
        html += '</div>';
      }
      
      contentEl.innerHTML = html;
    }
  } else if (payload.type === 'reading') {
    activity.classList.add('visible');
    if (typingEl) typingEl.style.display = 'none';
    
    contentEl.innerHTML = '<div class="reading-info">' +
      '<div class="book-title">' + escapeHtml(payload.title || 'Unknown') + '</div>' +
      '<div class="progress">' + (payload.percent || 0) + '% - <a href="/read#' + payload.bookId + ',' + payload.byteStart + '">Jump to position</a></div>' +
    '</div>';
  }
}

function updateRoomUI(): void {
  const banner = $('roomBanner');
  const bannerCode = $('bannerRoomCode');
  const bannerCount = $('bannerPeerCount');
  
  if (p2p.roomId) {
    document.body.classList.add('in-room');
    if (banner) banner.classList.add('visible');
    if (bannerCode) bannerCode.textContent = p2p.roomId;
    if (bannerCount) {
      const count = p2p.peers.size + 1;
      bannerCount.textContent = count + ' ' + (count === 1 ? 'person' : 'people');
    }
  } else {
    document.body.classList.remove('in-room');
    if (banner) banner.classList.remove('visible');
    
    const activity = $('peerActivity');
    if (activity) activity.classList.remove('visible');
  }
}

function saveRoom(roomId: string, displayName: string): void {
  try {
    localStorage.setItem(P2P_ROOM_KEY, JSON.stringify({ roomId, displayName }));
  } catch (e) {}
}

function loadSavedRoom(): { roomId: string; displayName: string } | null {
  try {
    const saved = localStorage.getItem(P2P_ROOM_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}

function clearSavedRoom(): void {
  try {
    localStorage.removeItem(P2P_ROOM_KEY);
  } catch (e) {}
}

function toggleP2PPanel(): void {
  const panel = $('p2pPanel');
  if (panel) panel.classList.toggle('visible');
}

function createRoom(): void {
  const nameInput = $('p2pDisplayName') as HTMLInputElement | null;
  const displayName = nameInput?.value.trim() || 'Anonymous';
  p2p.displayName = displayName;
  
  sendP2PMessage({
    type: 'create-room',
    payload: { displayName }
  });
  
  const panel = $('p2pPanel');
  if (panel) panel.classList.remove('visible');
}

function joinRoom(roomCode: string, displayName?: string): void {
  if (!roomCode || roomCode.length !== 6) {
    showHint('Room code must be 6 characters');
    return;
  }
  
  const nameInput = $('p2pDisplayName') as HTMLInputElement | null;
  displayName = displayName || nameInput?.value.trim() || 'Anonymous';
  p2p.displayName = displayName;
  
  sendP2PMessage({
    type: 'join-room',
    roomId: roomCode.toUpperCase(),
    payload: { displayName }
  });
  
  const panel = $('p2pPanel');
  if (panel) panel.classList.remove('visible');
}

function leaveRoom(): void {
  sendP2PMessage({ type: 'leave-room' });
  p2p.roomId = null;
  p2p.peers.clear();
  clearSavedRoom();
  updateRoomUI();
}

function copyRoomCode(): void {
  if (!p2p.roomId) return;
  
  navigator.clipboard.writeText(p2p.roomId).then(() => {
    const btn = $('bannerCopyBtn');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => { if (btn) btn.textContent = 'Copy'; }, 2000);
    }
  });
}

// Broadcast state
let isTyping = false;
let typingTimeout: number | null = null;

function broadcastState(forceTyping?: boolean): void {
  if (!p2p.roomId) return;
  
  if (p2p.broadcastTimeout) {
    clearTimeout(p2p.broadcastTimeout);
  }
  
  p2p.broadcastTimeout = window.setTimeout(() => {
    sendP2PMessage({
      type: 'stream-state',
      payload: {
        type: 'search',
        query: ($('query') as HTMLInputElement | null)?.value || '',
        results: currentResults.slice(0, 10),
        isTyping: forceTyping || isTyping,
        timestamp: Date.now()
      }
    });
  }, 50);
}

function setTyping(typing: boolean): void {
  isTyping = typing;
  
  if (typingTimeout) clearTimeout(typingTimeout);
  
  if (typing) {
    typingTimeout = window.setTimeout(() => {
      isTyping = false;
      broadcastState();
    }, 2000);
  }
  
  broadcastState(typing);
}
