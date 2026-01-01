#!/usr/bin/env node

import { WebServer } from './web-server.js';

const args = process.argv.slice(2);

// Parse options
let port = 3000;
let chunkSize = 200;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p' || args[i] === '--port') {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '-w' || args[i] === '--words') {
    chunkSize = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '-h' || args[i] === '--help') {
    console.log(`
gutex-web - Web UI for Gutex

Usage: gutex-web [options]

Options:
  -p, --port <port>    Port to listen on (default: 3000)
  -w, --words <count>  Default words per chunk (default: 200)
  -h, --help           Show this help

URL Format:
  http://localhost:<port>/#<bookId>
  http://localhost:<port>/#<bookId>,<byteStart>,<chunkSize>

Examples:
  gutex-web                    Start on default port 3000
  gutex-web -p 8080            Start on port 8080

Then open:
  http://localhost:3000/#1342           Pride and Prejudice (default 200 words)
  http://localhost:3000/#1342,0,50      Same book, 50 words per chunk
  http://localhost:3000/#1342,0,500     Same book, 500 words per chunk
  http://localhost:3000/#11,0,200       Alice in Wonderland

Users can change chunkSize in the URL to adjust reading pace.

Keyboard Controls (same as CLI):
  →↑ D W   Move forward
  ←↓ A S   Move backward
`);
    process.exit(0);
  }
}

const server = new WebServer({ port, chunkSize });
server.start();
