/**
 * P2P Signaling Server Tests
 * 
 * Tests the WebSocket-based relay server for multiplayer rooms.
 * Covers: registration, room creation/joining, broadcasting, message relay,
 * peer disconnection, edge cases, and error handling.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import { P2PSignalingServer } from '../src/p2p-signaling.js';

// Test configuration
const TEST_PORT = 9876;
const WS_URL = `ws://localhost:${TEST_PORT}/ws/signaling`;
const CONNECT_TIMEOUT = 2000;
const MESSAGE_TIMEOUT = 1000;

interface ConnectedClient {
  ws: WebSocket;
  peerId: string;
}

// Helper to create a WebSocket client, wait for connection, AND capture the initial peer-list
function createClient(): Promise<ConnectedClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, CONNECT_TIMEOUT);
    
    let connected = false;
    
    ws.on('open', () => {
      connected = true;
    });
    
    ws.on('message', (data: Buffer) => {
      if (!connected) return;
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg.type === 'peer-list' && msg.peerId) {
          clearTimeout(timeout);
          resolve({ ws, peerId: msg.peerId as string });
        }
      } catch {
        // ignore parse errors
      }
    });
    
    ws.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Helper to send a message and wait for response
function sendAndReceive(ws: WebSocket, message: object, expectedType?: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for response${expectedType ? ` of type ${expectedType}` : ''}`));
    }, MESSAGE_TIMEOUT);
    
    const handler = (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        if (!expectedType || parsed.type === expectedType) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch {
        // Ignore parse errors, wait for valid message
      }
    };
    
    ws.on('message', handler);
    ws.send(JSON.stringify(message));
  });
}

// Helper to wait for a specific message type
function waitForMessage(ws: WebSocket, expectedType: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${expectedType}`));
    }, MESSAGE_TIMEOUT);
    
    const handler = (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        if (parsed.type === expectedType) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch {
        // Ignore parse errors
      }
    };
    
    ws.on('message', handler);
  });
}

// Helper to register a client
async function registerClient(ws: WebSocket, displayName: string): Promise<string> {
  const response = await sendAndReceive(ws, {
    type: 'register',
    displayName
  }, 'peer-list');
  
  return response.peerId as string;
}

// Helper to create a room
async function createRoom(ws: WebSocket): Promise<string> {
  const response = await sendAndReceive(ws, {
    type: 'create-room'
  }, 'room-info');
  
  return response.roomId as string;
}

// Helper to join a room
async function joinRoom(ws: WebSocket, roomId: string): Promise<Record<string, unknown>> {
  return sendAndReceive(ws, {
    type: 'join-room',
    roomId
  }, 'room-info');
}

describe('P2P Signaling Server', () => {
  let httpServer: http.Server;
  let signalingServer: P2PSignalingServer;
  
  before(async () => {
    httpServer = http.createServer();
    signalingServer = new P2PSignalingServer();
    signalingServer.attach(httpServer);
    
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });
  });
  
  after(async () => {
    signalingServer.close();
    // Allow time for WebSocket close handshakes to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });
  
  describe('Connection and Registration', () => {
    it('should accept WebSocket connections', async () => {
      const { ws } = await createClient();
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      ws.close();
    });
    
    it('should assign a peer ID on connection', async () => {
      const { ws, peerId } = await createClient();
      
      assert.ok(peerId, 'Should receive a peerId');
      assert.strictEqual(typeof peerId, 'string');
      
      ws.close();
    });
    
    it('should generate unique peer IDs', async () => {
      const client1 = await createClient();
      const client2 = await createClient();
      
      assert.notStrictEqual(client1.peerId, client2.peerId, 'Peer IDs should be unique');
      
      client1.ws.close();
      client2.ws.close();
    });
  });
  
  describe('Room Creation', () => {
    it('should create a room and return room info', async () => {
      const { ws } = await createClient();
      
      const response = await sendAndReceive(ws, {
        type: 'create-room'
      }, 'room-info');
      
      assert.strictEqual(response.type, 'room-info');
      assert.ok(response.roomId, 'Should receive a roomId');
      assert.strictEqual(typeof response.roomId, 'string');
      assert.ok((response.roomId as string).length >= 6, 'Room ID should be at least 6 characters');
      
      ws.close();
    });
    
    it('should generate unique room IDs', async () => {
      const client1 = await createClient();
      const client2 = await createClient();
      
      const room1 = await sendAndReceive(client1.ws, { type: 'create-room' }, 'room-info');
      const room2 = await sendAndReceive(client2.ws, { type: 'create-room' }, 'room-info');
      
      assert.notStrictEqual(room1.roomId, room2.roomId, 'Room IDs should be unique');
      
      client1.ws.close();
      client2.ws.close();
    });
  });
  
  describe('Room Joining', () => {
    it('should allow joining an existing room', async () => {
      const creator = await createClient();
      const joiner = await createClient();
      
      const createResponse = await sendAndReceive(creator.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      const joinResponse = await sendAndReceive(joiner.ws, {
        type: 'join-room',
        roomId
      }, 'room-info');
      
      assert.strictEqual(joinResponse.type, 'room-info');
      assert.strictEqual(joinResponse.roomId, roomId);
      
      creator.ws.close();
      joiner.ws.close();
    });
    
    it('should notify existing members when someone joins', async () => {
      const creator = await createClient();
      const joiner = await createClient();
      
      const createResponse = await sendAndReceive(creator.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      // Set up listener for peer-list with action='joined' before join happens
      const peerJoinedPromise = waitForMessage(creator.ws, 'peer-list');
      
      await sendAndReceive(joiner.ws, { type: 'join-room', roomId }, 'room-info');
      
      const notification = await peerJoinedPromise;
      
      assert.strictEqual(notification.type, 'peer-list');
      const payload = notification.payload as Record<string, unknown>;
      assert.strictEqual(payload.action, 'joined');
      
      creator.ws.close();
      joiner.ws.close();
    });
    
    it('should fail to join non-existent room', async () => {
      const { ws } = await createClient();
      
      const response = await sendAndReceive(ws, {
        type: 'join-room',
        roomId: 'NONEXISTENT'
      }, 'error');
      
      assert.strictEqual(response.type, 'error');
      
      ws.close();
    });
  });
  
  describe('Broadcasting and Stream State', () => {
    it('should relay stream state from broadcaster to followers', async () => {
      const broadcaster = await createClient();
      const follower = await createClient();
      
      const createResponse = await sendAndReceive(broadcaster.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      await sendAndReceive(follower.ws, { type: 'join-room', roomId }, 'room-info');
      
      // Set up listener before broadcast
      const streamStatePromise = waitForMessage(follower.ws, 'stream-state');
      
      // Broadcaster sends stream state
      broadcaster.ws.send(JSON.stringify({
        type: 'stream-state',
        payload: {
          bookId: 1342,
          bookTitle: 'Pride and Prejudice',
          bookAuthor: 'Jane Austen',
          byteStart: 50000,
          percent: '25%',
          mode: '2d',
          text: 'It is a truth universally acknowledged...'
        }
      }));
      
      const relayed = await streamStatePromise;
      
      assert.strictEqual(relayed.type, 'stream-state');
      const payload = relayed.payload as Record<string, unknown>;
      assert.strictEqual(payload.bookId, 1342);
      assert.strictEqual(payload.bookTitle, 'Pride and Prejudice');
      
      broadcaster.ws.close();
      follower.ws.close();
    });
    
    it('should relay 3D mode stream state with visible words', async () => {
      const broadcaster = await createClient();
      const follower = await createClient();
      
      const createResponse = await sendAndReceive(broadcaster.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      await sendAndReceive(follower.ws, { type: 'join-room', roomId }, 'room-info');
      
      const streamStatePromise = waitForMessage(follower.ws, 'stream-state');
      
      broadcaster.ws.send(JSON.stringify({
        type: 'stream-state',
        payload: {
          bookId: 345,
          bookTitle: 'Dracula',
          mode: '3d',
          visibleWords: ['the', 'vampire', 'approached', 'slowly'],
          wordOffset: 123.5
        }
      }));
      
      const relayed = await streamStatePromise;
      const payload = relayed.payload as Record<string, unknown>;
      
      assert.strictEqual(payload.mode, '3d');
      assert.deepStrictEqual(payload.visibleWords, ['the', 'vampire', 'approached', 'slowly']);
      assert.strictEqual(payload.wordOffset, 123.5);
      
      broadcaster.ws.close();
      follower.ws.close();
    });
    
    it('should relay to multiple followers', async () => {
      const broadcaster = await createClient();
      const follower1 = await createClient();
      const follower2 = await createClient();
      
      const createResponse = await sendAndReceive(broadcaster.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      await sendAndReceive(follower1.ws, { type: 'join-room', roomId }, 'room-info');
      await sendAndReceive(follower2.ws, { type: 'join-room', roomId }, 'room-info');
      
      const promise1 = waitForMessage(follower1.ws, 'stream-state');
      const promise2 = waitForMessage(follower2.ws, 'stream-state');
      
      broadcaster.ws.send(JSON.stringify({
        type: 'stream-state',
        payload: { bookId: 11, mode: '2d', text: 'Alice fell down the rabbit hole' }
      }));
      
      const [relayed1, relayed2] = await Promise.all([promise1, promise2]);
      
      assert.strictEqual((relayed1.payload as Record<string, unknown>).bookId, 11);
      assert.strictEqual((relayed2.payload as Record<string, unknown>).bookId, 11);
      
      broadcaster.ws.close();
      follower1.ws.close();
      follower2.ws.close();
    });
    
    it('should not relay stream state to the sender', async () => {
      const broadcaster = await createClient();
      
      await sendAndReceive(broadcaster.ws, { type: 'create-room' }, 'room-info');
      
      let receivedEcho = false;
      broadcaster.ws.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg.type === 'stream-state') {
          receivedEcho = true;
        }
      });
      
      broadcaster.ws.send(JSON.stringify({
        type: 'stream-state',
        payload: { bookId: 1, mode: '2d' }
      }));
      
      // Wait a bit to ensure no echo
      await new Promise(resolve => setTimeout(resolve, 200));
      
      assert.strictEqual(receivedEcho, false, 'Broadcaster should not receive their own stream state');
      
      broadcaster.ws.close();
    });
    
    it('should update peer broadcaster status when broadcasting flag is sent', async () => {
      const broadcaster = await createClient();
      const lateJoiner = await createClient();
      
      // Create room
      const createResponse = await sendAndReceive(broadcaster.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      // Broadcaster sends a stream-state with broadcasting: true (simulating start of broadcast)
      broadcaster.ws.send(JSON.stringify({
        type: 'stream-state',
        payload: { broadcasting: true, bookId: 42, mode: '2d', text: 'Test content' }
      }));
      
      // Brief delay to allow server to process
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Late joiner joins the room
      const joinResponse = await sendAndReceive(lateJoiner.ws, { type: 'join-room', roomId }, 'room-info');
      
      // The room-info should show the broadcaster with isBroadcaster: true
      const roomInfo = joinResponse.payload as Record<string, unknown>;
      const room = roomInfo.room as Record<string, unknown>;
      const peers = room.peers as Array<Record<string, unknown>>;
      
      // Find the broadcaster peer
      const broadcasterPeer = peers.find(p => p.id === broadcaster.peerId);
      assert.ok(broadcasterPeer, 'Broadcaster should be in peer list');
      assert.strictEqual(broadcasterPeer.isBroadcaster, true, 'Broadcaster should have isBroadcaster: true');
      
      broadcaster.ws.close();
      lateJoiner.ws.close();
    });
  });
  
  describe('Leaving Rooms and Disconnection', () => {
    it('should allow peers to leave rooms', async () => {
      const creator = await createClient();
      const joiner = await createClient();
      
      const createResponse = await sendAndReceive(creator.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      await sendAndReceive(joiner.ws, { type: 'join-room', roomId }, 'room-info');
      
      // Leave the room
      joiner.ws.send(JSON.stringify({ type: 'leave-room' }));
      
      // Brief delay to allow the leave to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify connections still work
      assert.strictEqual(joiner.ws.readyState, WebSocket.OPEN);
      assert.strictEqual(creator.ws.readyState, WebSocket.OPEN);
      
      creator.ws.close();
      joiner.ws.close();
    });
    
    it('should handle abrupt disconnections', async () => {
      const creator = await createClient();
      const joiner = await createClient();
      
      const createResponse = await sendAndReceive(creator.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      await sendAndReceive(joiner.ws, { type: 'join-room', roomId }, 'room-info');
      
      // Abrupt disconnect
      joiner.ws.close();
      
      // Brief delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Creator should still be connected
      assert.strictEqual(creator.ws.readyState, WebSocket.OPEN);
      
      creator.ws.close();
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const { ws } = await createClient();
      
      // Send invalid JSON
      ws.send('not valid json {{{');
      
      // Should not crash, connection should remain open
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN, 'Connection should remain open');
      
      ws.close();
    });
    
    it('should handle unknown message types', async () => {
      const { ws } = await createClient();
      
      // Send unknown message type
      ws.send(JSON.stringify({
        type: 'unknown-type-xyz',
        data: 'test'
      }));
      
      // Should not crash
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      
      ws.close();
    });
    
    it('should handle rapid message sending', async () => {
      const { ws } = await createClient();
      
      const createResponse = await sendAndReceive(ws, { type: 'create-room' }, 'room-info');
      
      // Send many messages rapidly
      for (let i = 0; i < 50; i++) {
        ws.send(JSON.stringify({
          type: 'stream-state',
          state: { bookId: i, mode: '2d' }
        }));
      }
      
      // Should handle without crashing
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      
      ws.close();
    });
  });
  
  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous connections', async () => {
      // Create 10 clients simultaneously
      const connectionPromises = Array(10).fill(null).map(() => createClient());
      const clients = await Promise.all(connectionPromises);
      
      // All should have unique IDs (already captured by createClient)
      const peerIds = clients.map(c => c.peerId);
      const uniqueIds = new Set(peerIds);
      assert.strictEqual(uniqueIds.size, 10, 'All peer IDs should be unique');
      
      // Clean up
      clients.forEach(c => c.ws.close());
    });
    
    it('should handle room with many peers', async () => {
      const broadcaster = await createClient();
      
      const createResponse = await sendAndReceive(broadcaster.ws, { type: 'create-room' }, 'room-info');
      const roomId = createResponse.roomId as string;
      
      const followers: ConnectedClient[] = [];
      
      // Join 5 followers
      for (let i = 0; i < 5; i++) {
        const follower = await createClient();
        await sendAndReceive(follower.ws, { type: 'join-room', roomId }, 'room-info');
        followers.push(follower);
      }
      
      // Drain any peer-list notifications that came in during joins
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Set up listeners on all followers
      const streamPromises = followers.map(f => waitForMessage(f.ws, 'stream-state'));
      
      // Broadcast
      broadcaster.ws.send(JSON.stringify({
        type: 'stream-state',
        payload: { bookId: 42, mode: '2d', text: 'Test broadcast to many' }
      }));
      
      // All should receive
      const results = await Promise.all(streamPromises);
      results.forEach(result => {
        assert.strictEqual((result.payload as Record<string, unknown>).bookId, 42);
      });
      
      broadcaster.ws.close();
      followers.forEach(f => f.ws.close());
    });
  });
});

// Additional integration-style tests
describe('P2P Integration Scenarios', () => {
  let httpServer: http.Server;
  let signalingServer: P2PSignalingServer;
  const port = TEST_PORT + 1;
  const wsUrl = `ws://localhost:${port}/ws/signaling`;
  
  // Helper to create client for integration tests (different port)
  function createIntegrationClient(): Promise<ConnectedClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, CONNECT_TIMEOUT);
      
      let connected = false;
      
      ws.on('open', () => {
        connected = true;
      });
      
      ws.on('message', (data: Buffer) => {
        if (!connected) return;
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          if (msg.type === 'peer-list' && msg.peerId) {
            clearTimeout(timeout);
            resolve({ ws, peerId: msg.peerId as string });
          }
        } catch {
          // ignore parse errors
        }
      });
      
      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
  
  before(async () => {
    httpServer = http.createServer();
    signalingServer = new P2PSignalingServer();
    signalingServer.attach(httpServer);
    
    await new Promise<void>((resolve) => {
      httpServer.listen(port, () => resolve());
    });
  });
  
  after(async () => {
    signalingServer.close();
    // Allow time for WebSocket close handshakes to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });
  
  it('should support a complete reading session workflow', async () => {
    // Alice creates a room
    const alice = await createIntegrationClient();
    
    const aliceRoom = await sendAndReceive(alice.ws, { type: 'create-room' }, 'room-info');
    const roomId = aliceRoom.roomId as string;
    
    // Bob joins
    const bob = await createIntegrationClient();
    
    const bobJoinPromise = sendAndReceive(bob.ws, { type: 'join-room', roomId }, 'room-info');
    const alicePeerJoinedPromise = waitForMessage(alice.ws, 'peer-list');
    
    await bobJoinPromise;
    const peerJoined = await alicePeerJoinedPromise;
    const joinPayload = peerJoined.payload as Record<string, unknown>;
    assert.strictEqual(joinPayload.action, 'joined');
    
    // Alice broadcasts her reading position
    const bobStreamPromise = waitForMessage(bob.ws, 'stream-state');
    
    alice.ws.send(JSON.stringify({
      type: 'stream-state',
      payload: {
        bookId: 1342,
        bookTitle: 'Pride and Prejudice',
        bookAuthor: 'Jane Austen',
        byteStart: 10000,
        percent: '5%',
        mode: '2d',
        text: 'It is a truth universally acknowledged...'
      }
    }));
    
    const bobReceived = await bobStreamPromise;
    const payload = bobReceived.payload as Record<string, unknown>;
    assert.strictEqual(payload.bookTitle, 'Pride and Prejudice');
    assert.strictEqual(bobReceived.peerId, alice.peerId);
    
    // Bob leaves
    const alicePeerLeftPromise = waitForMessage(alice.ws, 'peer-list');
    
    bob.ws.send(JSON.stringify({ type: 'leave-room' }));
    
    const peerLeft = await alicePeerLeftPromise;
    const leftPayload = peerLeft.payload as Record<string, unknown>;
    assert.strictEqual(leftPayload.action, 'left');
    
    alice.ws.close();
    bob.ws.close();
  });
});
