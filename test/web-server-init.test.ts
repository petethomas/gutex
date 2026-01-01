import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WebServer } from '../src/web-server.js';
import { Fetcher } from '../src/fetcher.js';

/**
 * Integration tests for web server book initialization and fallback behavior
 * These tests hit real Gutenberg servers and will be skipped if network is unavailable
 */
describe('Web Server Book Initialization', () => {
  
  // Helper to check if Gutenberg is reachable
  async function canReachGutenberg(): Promise<boolean> {
    try {
      const fetcher = new Fetcher(1342, false);
      await fetcher.getFileSize();
      return true;
    } catch (err) {
      return false;
    }
  }
  
  it('should automatically find alternative text version when book ID 404s', async () => {
    if (!await canReachGutenberg()) {
      console.log('Skipping: Gutenberg unreachable');
      return;
    }
    
    // Book 9676 exists in Gutenberg catalog but has no text file
    // The Gutendex API should find an alternative (like 550) that does have text
    const server = new WebServer({ port: 0 });
    
    // Ensure catalog is loaded for title lookup
    try {
      await server.catalog.ensureCatalog();
    } catch (err) {
      // If catalog fails to load, skip test
      console.log('Skipping: catalog unavailable');
      return;
    }
    
    const navigator = await server.getNavigator(9676);
    
    assert.ok(navigator, 'Should return a navigator');
    assert.ok(navigator.boundaries.cleanLength > 0, 'Should have content');
    assert.strictEqual((navigator as any).requestedBookId, 9676, 'Should track requested ID');
    assert.ok((navigator as any).actualBookId !== 9676, `Should use alternative ID, got ${(navigator as any).actualBookId}`);
  });

  it('should use original book ID when text file exists', async () => {
    if (!await canReachGutenberg()) {
      console.log('Skipping: Gutenberg unreachable');
      return;
    }
    
    const server = new WebServer({ port: 0 });
    const navigator = await server.getNavigator(1342);
    
    assert.ok(navigator, 'Should return a navigator');
    assert.ok(navigator.boundaries.cleanLength > 0, 'Should have content');
    assert.strictEqual((navigator as any).actualBookId, 1342, 'Should use original ID when it works');
  });

  it('should work with Frankenstein (book 84)', async () => {
    if (!await canReachGutenberg()) {
      console.log('Skipping: Gutenberg unreachable');
      return;
    }
    
    const server = new WebServer({ port: 0 });
    const navigator = await server.getNavigator(84);
    assert.ok(navigator.boundaries.cleanLength > 0);
    assert.strictEqual((navigator as any).actualBookId, 84);
  });

  it('should work with Don Quixote (book 996)', async () => {
    if (!await canReachGutenberg()) {
      console.log('Skipping: Gutenberg unreachable');
      return;
    }
    
    const server = new WebServer({ port: 0 });
    const navigator = await server.getNavigator(996);
    assert.ok(navigator.boundaries.cleanLength > 0);
    assert.strictEqual((navigator as any).actualBookId, 996);
  });

  it('should throw useful error when no alternative can be found', async () => {
    const server = new WebServer({ port: 0 });
    // Book ID that doesn't exist anywhere
    try {
      await server.getNavigator(99999999);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(
        (err as Error).message.includes('not found') || (err as Error).message.includes('unavailable'),
        `Should give useful error, got: ${(err as Error).message}`
      );
    }
  });
});
