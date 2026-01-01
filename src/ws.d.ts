// Type declarations for ws module
declare module 'ws' {
  import { Server } from 'http';
  import { EventEmitter } from 'events';

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;

    readonly readyState: number;

    constructor(address: string, options?: object);

    close(code?: number, reason?: string): void;
    send(data: string | Buffer, callback?: (err?: Error) => void): void;
    ping(data?: string | Buffer, mask?: boolean, callback?: (err?: Error) => void): void;
    pong(data?: string | Buffer, mask?: boolean, callback?: (err?: Error) => void): void;
    terminate(): void;

    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: Buffer) => void): this;
    on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;

    off(event: 'message', listener: (data: Buffer) => void): this;
    off(event: string, listener: (...args: unknown[]) => void): this;
  }

  export interface ServerOptions {
    server?: Server;
    path?: string;
    port?: number;
    host?: string;
  }

  export class WebSocketServer extends EventEmitter {
    clients: Set<WebSocket>;
    
    constructor(options?: ServerOptions);

    close(callback?: () => void): void;

    on(event: 'connection', listener: (ws: WebSocket, request: unknown) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: () => void): this;
  }
}
