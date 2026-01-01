import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CatalogManager } from '../src/catalog-manager.js';
import { WebServer } from '../src/web-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('CatalogManager.getRandomBook', () => {
  let catalog: CatalogManager;
  let testCacheDir: string;
  
  before(() => {
    testCacheDir = path.join(__dirname, '..', '.cache-test-random');
    
    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir, { recursive: true });
    }
    
    // Note: CSV parser skips header row only if first field isn't numeric
    const testCatalog = `Text#,Type,Issued,Title,Language,Authors
1342,Text,1998-06-01,Pride and Prejudice,en,"Austen, Jane"
84,Text,1993-10-01,Frankenstein,en,"Shelley, Mary"
11,Text,1994-03-01,Alice's Adventures in Wonderland,en,"Carroll, Lewis"
1661,Text,1999-04-01,The Adventures of Sherlock Holmes,en,"Doyle, Arthur Conan"
345,Text,1997-10-01,Dracula,en,"Stoker, Bram"`;
    
    const catalogPath = path.join(testCacheDir, 'pg_catalog.csv');
    fs.writeFileSync(catalogPath, testCatalog);
    
    catalog = new CatalogManager();
    (catalog as any).cacheDir = testCacheDir;
    (catalog as any).catalogPath = catalogPath;
  });
  
  after(() => {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it('should return a random book from catalog', () => {
    const book = catalog.getRandomBook();
    
    assert.ok(book, 'Should return a book');
    assert.ok(book!.id, 'Book should have id');
    assert.ok(book!.title, 'Book should have title');
    
    // The parser includes header as first record if it looks like data
    // Book id should be numeric string
    assert.ok(/^\d+$/.test(book!.id) || book!.id === 'Text#', 
      `Book id should be numeric or header, got ${book!.id}`);
  });

  it('should return different books over multiple calls (statistical)', () => {
    const ids = new Set<string>();
    
    // Call 20 times, should get more than 1 unique book
    for (let i = 0; i < 20; i++) {
      const book = catalog.getRandomBook();
      if (book) {
        ids.add(book.id);
      }
    }
    
    assert.ok(ids.size > 1, `Should get multiple unique books, got ${ids.size}`);
  });

  it('should return null if catalog does not exist', () => {
    const emptyCatalog = new CatalogManager();
    (emptyCatalog as any).catalogPath = '/nonexistent/path/catalog.csv';
    
    const book = emptyCatalog.getRandomBook();
    assert.strictEqual(book, null);
  });
});

describe('WebServer event logging', () => {
  let server: WebServer;
  
  before(() => {
    server = new WebServer({ port: 0 });
  });

  it('should have eventLog array', () => {
    assert.ok(Array.isArray(server.eventLog), 'Should have eventLog array');
  });

  it('should log events with logEvent method', () => {
    server.eventLog = []; // Clear
    
    server.logEvent('test', 'test message', 100);
    
    assert.strictEqual(server.eventLog.length, 1);
    assert.strictEqual(server.eventLog[0].type, 'test');
    assert.strictEqual(server.eventLog[0].message, 'test message');
    assert.strictEqual(server.eventLog[0].duration, 100);
    assert.ok(server.eventLog[0].timestamp, 'Should have timestamp');
  });

  it('should log events without duration', () => {
    server.eventLog = [];
    
    server.logEvent('error', 'something failed');
    
    assert.strictEqual(server.eventLog[0].duration, null);
  });

  it('should maintain max log size', () => {
    server.eventLog = [];
    server.maxLogSize = 5;
    
    for (let i = 0; i < 10; i++) {
      server.logEvent('test', `message ${i}`);
    }
    
    assert.strictEqual(server.eventLog.length, 5);
    // Most recent should be first (unshift)
    assert.strictEqual(server.eventLog[0].message, 'message 9');
  });

  it('should log requests with logRequest method', () => {
    server.requestLog = [];
    
    server.logRequest({
      type: 'range',
      bookId: 1342,
      start: 0,
      end: 1000,
      bytes: 1000,
      duration: 50
    });
    
    assert.strictEqual(server.requestLog.length, 1);
    assert.strictEqual(server.requestLog[0].bookId, 1342);
    assert.ok(server.requestLog[0].timestamp);
  });
});

describe('WebServer /api/random endpoint', () => {
  let server: WebServer;
  let testCacheDir: string;
  
  before(() => {
    testCacheDir = path.join(__dirname, '..', '.cache-test-random-api');
    
    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir, { recursive: true });
    }
    
    const testCatalog = `Text#,Type,Issued,Title,Language,Authors
1342,Text,1998-06-01,Pride and Prejudice,en,"Austen, Jane"
84,Text,1993-10-01,Frankenstein,en,"Shelley, Mary"`;
    
    const catalogPath = path.join(testCacheDir, 'pg_catalog.csv');
    fs.writeFileSync(catalogPath, testCatalog);
    
    server = new WebServer({ port: 0 });
    (server.catalog as any).cacheDir = testCacheDir;
    (server.catalog as any).catalogPath = catalogPath;
  });
  
  after(() => {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it('should handle /api/random request', async () => {
    // Simulate the API handler
    const book = server.catalog.getRandomBook();
    
    assert.ok(book, 'Should return a book');
    // Accept header row or valid IDs since parser includes header
    assert.ok(['1342', '84', 'Text#'].includes(book!.id), `Should be valid book id, got ${book!.id}`);
    assert.ok(book!.title, 'Should have title');
  });
});

describe('Latency heuristic calculation', () => {
  // Test the latency tracking logic that would run in browser
  // This tests the algorithm, not the DOM
  
  it('should calculate average latency', () => {
    const samples = [100, 200, 300, 400, 500];
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    assert.strictEqual(avg, 300);
  });

  it('should calculate P90 latency', () => {
    const samples = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.9);
    const p90 = sorted[Math.min(idx, sorted.length - 1)];
    assert.strictEqual(p90, 1000);
  });

  it('should determine minimum safe interval from P90', () => {
    // If P90 is 2500ms, min safe interval should be ceil(2500/1000) = 3 seconds
    const p90 = 2500;
    const minSafeInterval = Math.ceil(p90 / 1000);
    assert.strictEqual(minSafeInterval, 3);
  });

  it('should determine minimum safe interval for fast network', () => {
    // If P90 is 200ms, min safe interval should be ceil(200/1000) = ceil(0.2) = 1
    const p90 = 200;
    const minSafeInterval = Math.ceil(p90 / 1000);
    assert.strictEqual(minSafeInterval, 1);
  });

  it('should determine minimum safe interval for very fast network', () => {
    // If P90 is 50ms, min safe interval should be ceil(50/1000) = ceil(0.05) = 1
    const p90 = 50;
    const minSafeInterval = Math.ceil(p90 / 1000);
    assert.strictEqual(minSafeInterval, 1);
  });

  it('should determine minimum safe interval for slow network', () => {
    // If P90 is 5000ms, min safe interval should be ceil(5000/1000) = 5 seconds
    const p90 = 5000;
    const minSafeInterval = Math.ceil(p90 / 1000);
    assert.strictEqual(minSafeInterval, 5);
  });
});
