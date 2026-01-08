/**
 * P2P Signaling Server for Gutex
 * WebSocket-based relay for multiplayer reading rooms
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import crypto from 'crypto';

export interface SignalingMessage {
  type: 'create-room' | 'join-room' | 'leave-room' | 'offer' | 'answer' | 'ice-candidate' | 
        'peer-list' | 'room-info' | 'error' | 'stream-state' | 'chat';
  roomId?: string;
  peerId?: string;
  targetPeerId?: string;
  payload?: unknown;
}

export interface RoomPeer {
  id: string;
  ws: WebSocket;
  displayName: string;
  isBroadcaster: boolean;
  joinedAt: number;
}

export interface Room {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  peers: Map<string, RoomPeer>;
  broadcasters: Set<string>;
}

export class P2PSignalingServer {
  private wss: WebSocketServer | null = null;
  private rooms = new Map<string, Room>();
  private peerToRoom = new Map<string, string>();
  private wsTopeerId = new Map<WebSocket, string>();

  constructor() {}

  /**
   * Close the signaling server and all client connections
   */
  close(): void {
    if (this.wss) {
      // Close all client connections first
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      }
      this.wss.close();
      this.wss = null;
    }
    this.rooms.clear();
    this.peerToRoom.clear();
    this.wsTopeerId.clear();
  }

  /**
   * Attach signaling server to an existing HTTP server
   */
  attach(server: http.Server): void {
    this.wss = new WebSocketServer({ noServer: true } as any);

    this.wss.on('connection', (ws: WebSocket) => {
      const peerId = this.generatePeerId();
      this.wsTopeerId.set(ws, peerId);

      // Send peer their ID
      this.send(ws, { type: 'peer-list', peerId, payload: { yourId: peerId } });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as SignalingMessage;
          this.handleMessage(ws, peerId, message);
        } catch (err) {
          this.send(ws, { type: 'error', payload: { message: 'Invalid message format' } });
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(peerId);
        this.wsTopeerId.delete(ws);
      });

      ws.on('error', () => {
        this.handleDisconnect(peerId);
        this.wsTopeerId.delete(ws);
      });
    });

    // Handle upgrade requests for our path
    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
      
      if (pathname === '/ws/signaling') {
        (this.wss as any).handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.wss!.emit('connection', ws, request);
        });
      }
      // Don't destroy socket here - let other handlers try
    });

    console.log('🔗 P2P Signaling server attached at /ws/signaling');
  }

  private generatePeerId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private generateRoomId(): string {
    // Generate a readable room code (6 characters)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  private send(ws: WebSocket, message: SignalingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(room: Room, message: SignalingMessage, excludePeerId?: string): void {
    room.peers.forEach((peer, id) => {
      if (id !== excludePeerId) {
        this.send(peer.ws, message);
      }
    });
  }

  private handleMessage(ws: WebSocket, peerId: string, message: SignalingMessage): void {
    switch (message.type) {
      case 'create-room':
        this.handleCreateRoom(ws, peerId, message);
        break;
      case 'join-room':
        this.handleJoinRoom(ws, peerId, message);
        break;
      case 'leave-room':
        this.handleLeaveRoom(peerId);
        break;
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        this.handleSignaling(peerId, message);
        break;
      case 'stream-state':
        this.handleStreamState(peerId, message);
        break;
      case 'chat':
        this.handleChat(peerId, message);
        break;
    }
  }

  private handleCreateRoom(ws: WebSocket, peerId: string, message: SignalingMessage): void {
    // Leave any existing room
    this.handleLeaveRoom(peerId);

    const payload = message.payload as { name?: string; displayName?: string; roomId?: string } | undefined;
    // Use provided roomId if valid and not taken, otherwise generate one
    let roomId = payload?.roomId?.toUpperCase();
    if (!roomId || roomId.length < 4 || this.rooms.has(roomId)) {
      roomId = this.generateRoomId();
    }
    const roomName = payload?.name || `Room ${roomId}`;
    const displayName = payload?.displayName || `User ${peerId.slice(0, 4)}`;

    const room: Room = {
      id: roomId,
      name: roomName,
      createdAt: Date.now(),
      createdBy: peerId,
      peers: new Map(),
      broadcasters: new Set([peerId]) // Creator is automatically a broadcaster
    };

    const peer: RoomPeer = {
      id: peerId,
      ws,
      displayName,
      isBroadcaster: true,
      joinedAt: Date.now()
    };

    room.peers.set(peerId, peer);
    this.rooms.set(roomId, room);
    this.peerToRoom.set(peerId, roomId);

    this.send(ws, {
      type: 'room-info',
      roomId,
      peerId,
      payload: {
        room: this.serializeRoom(room),
        yourPeerId: peerId,
        isBroadcaster: true
      }
    });
  }

  private handleJoinRoom(ws: WebSocket, peerId: string, message: SignalingMessage): void {
    const roomId = message.roomId?.toUpperCase();
    const payload = message.payload as { displayName?: string; asBroadcaster?: boolean } | undefined;
    const displayName = payload?.displayName || `User ${peerId.slice(0, 4)}`;
    const asBroadcaster = payload?.asBroadcaster ?? false;

    if (!roomId) {
      this.send(ws, { type: 'error', payload: { message: 'Room ID required' } });
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.send(ws, { type: 'error', payload: { message: 'Room not found' } });
      return;
    }

    // Leave any existing room
    this.handleLeaveRoom(peerId);

    const peer: RoomPeer = {
      id: peerId,
      ws,
      displayName,
      isBroadcaster: asBroadcaster,
      joinedAt: Date.now()
    };

    room.peers.set(peerId, peer);
    if (asBroadcaster) {
      room.broadcasters.add(peerId);
    }
    this.peerToRoom.set(peerId, roomId);

    // Notify existing peers about new peer
    this.broadcast(room, {
      type: 'peer-list',
      roomId,
      payload: {
        action: 'joined',
        peer: this.serializePeer(peer),
        peers: this.serializePeers(room)
      }
    }, peerId);

    // Send room info to joining peer
    this.send(ws, {
      type: 'room-info',
      roomId,
      peerId,
      payload: {
        room: this.serializeRoom(room),
        yourPeerId: peerId,
        isBroadcaster: asBroadcaster
      }
    });
  }

  private handleLeaveRoom(peerId: string): void {
    const roomId = this.peerToRoom.get(peerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.peers.delete(peerId);
    room.broadcasters.delete(peerId);
    this.peerToRoom.delete(peerId);

    if (room.peers.size === 0) {
      // Room is empty, delete it
      this.rooms.delete(roomId);
    } else {
      // Notify remaining peers
      this.broadcast(room, {
        type: 'peer-list',
        roomId,
        payload: {
          action: 'left',
          peerId,
          peers: this.serializePeers(room)
        }
      });
    }
  }

  private handleSignaling(peerId: string, message: SignalingMessage): void {
    const roomId = this.peerToRoom.get(peerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const targetPeer = room.peers.get(message.targetPeerId || '');
    if (!targetPeer) return;

    // Forward the signaling message to target peer
    this.send(targetPeer.ws, {
      ...message,
      peerId // Add sender's ID
    });
  }

  private handleStreamState(peerId: string, message: SignalingMessage): void {
    const roomId = this.peerToRoom.get(peerId);
    if (!roomId) {
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    // Update broadcaster status if specified in the message
    const payload = message.payload as { broadcasting?: boolean } | undefined;
    if (payload?.broadcasting !== undefined) {
      const peer = room.peers.get(peerId);
      if (peer) {
        peer.isBroadcaster = payload.broadcasting;
        if (payload.broadcasting) {
          room.broadcasters.add(peerId);
        } else {
          room.broadcasters.delete(peerId);
        }
      }
    }

    // Broadcast stream state to all peers in room
    this.broadcast(room, {
      type: 'stream-state',
      roomId,
      peerId,
      payload: message.payload
    }, peerId);
  }

  private handleChat(peerId: string, message: SignalingMessage): void {
    const roomId = this.peerToRoom.get(peerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const peer = room.peers.get(peerId);
    if (!peer) return;

    // Broadcast chat to all peers in room
    this.broadcast(room, {
      type: 'chat',
      roomId,
      peerId,
      payload: {
        displayName: peer.displayName,
        message: (message.payload as { message?: string })?.message,
        timestamp: Date.now()
      }
    });
  }

  private handleDisconnect(peerId: string): void {
    this.handleLeaveRoom(peerId);
  }

  private serializeRoom(room: Room): object {
    return {
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      peerCount: room.peers.size,
      broadcasterCount: room.broadcasters.size,
      peers: this.serializePeers(room)
    };
  }

  private serializePeer(peer: RoomPeer): object {
    return {
      id: peer.id,
      displayName: peer.displayName,
      isBroadcaster: peer.isBroadcaster,
      joinedAt: peer.joinedAt
    };
  }

  private serializePeers(room: Room): object[] {
    return Array.from(room.peers.values()).map(p => this.serializePeer(p));
  }

  /**
   * Get list of active rooms (for admin/debug)
   */
  getRooms(): object[] {
    return Array.from(this.rooms.values()).map(room => this.serializeRoom(room));
  }
}
