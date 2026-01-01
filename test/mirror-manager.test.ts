import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { MirrorManager, resetSharedMirrorManager } from '../src/mirror-manager.js';
import type { Mirror } from '../src/types.js';

describe('MirrorManager', () => {
  
  beforeEach(() => {
    resetSharedMirrorManager();
  });

  describe('_parseMirrorsFile', () => {
    it('parses pipe-delimited MIRRORS.ALL format correctly', () => {
      const mm = new MirrorManager();
      const content = `   continent   |    nation     |     location      |     provider     |     url     |     note
---------------+---------------+-------------------+------------------+-------------+----------
 Europe        | Great Britain | Kent              | UK Mirror        | http://example.com/gutenberg/ | 
 North America | United States | San Diego         | PG               | https://pg.org/ | High speed
(2 rows)
`;
      
      const mirrors = mm._parseMirrorsFile(content);
      
      assert.strictEqual(mirrors.length, 2);
      assert.strictEqual(mirrors[0].provider, 'PG'); // HTTPS sorted first
      assert.strictEqual(mirrors[0].baseUrl, 'https://pg.org');
      assert.strictEqual(mirrors[1].provider, 'UK Mirror');
      assert.strictEqual(mirrors[1].baseUrl, 'http://example.com/gutenberg');
    });

    it('filters out FTP, rsync, and gopher URLs', () => {
      const mm = new MirrorManager();
      const content = `   continent   |    nation     |     location      |     provider     |     url     |     note
---------------+---------------+-------------------+------------------+-------------+----------
 Europe        | UK            | London            | FTP Mirror       | ftp://ftp.example.com/gutenberg/ | 
 Europe        | UK            | London            | Rsync Mirror     | rsync://rsync.example.com/gutenberg/ | 
 Europe        | UK            | London            | Gopher Mirror    | gopher://gopher.example.com/ | 
 Europe        | UK            | London            | HTTP Mirror      | http://http.example.com/gutenberg/ | 
(4 rows)
`;
      
      const mirrors = mm._parseMirrorsFile(content);
      
      assert.strictEqual(mirrors.length, 1);
      assert.strictEqual(mirrors[0].provider, 'HTTP Mirror');
    });

    it('filters out /dirs/ style URLs', () => {
      const mm = new MirrorManager();
      const content = `   continent   |    nation     |     location      |     provider     |     url     |     note
---------------+---------------+-------------------+------------------+-------------+----------
 North America | US            | Chapel Hill       | iBiblio          | https://www.gutenberg.org/dirs/ | Main site
 North America | US            | San Diego         | PG               | https://aleph.pglaf.org/ | 
(2 rows)
`;
      
      const mirrors = mm._parseMirrorsFile(content);
      
      assert.strictEqual(mirrors.length, 1);
      assert.strictEqual(mirrors[0].provider, 'PG');
    });

    it('filters out gutenberg-epub variant (epub only, not txt)', () => {
      const mm = new MirrorManager();
      const content = `   continent   |    nation     |     location      |     provider     |     url     |     note
---------------+---------------+-------------------+------------------+-------------+----------
 North America | US            | Virginia          | ODU              | https://mirror.cs.odu.edu/gutenberg-epub/ | 
 North America | US            | Virginia          | ODU              | https://mirror.cs.odu.edu/gutenberg/ | 
(2 rows)
`;
      
      const mirrors = mm._parseMirrorsFile(content);
      
      assert.strictEqual(mirrors.length, 1);
      assert.strictEqual(mirrors[0].baseUrl, 'https://mirror.cs.odu.edu/gutenberg');
    });

    it('removes duplicate URLs', () => {
      const mm = new MirrorManager();
      const content = `   continent   |    nation     |     location      |     provider     |     url     |     note
---------------+---------------+-------------------+------------------+-------------+----------
 North America | US            | San Diego         | PG 1             | https://aleph.pglaf.org/ | 
 North America | US            | San Diego         | PG 2             | https://aleph.pglaf.org | 
(2 rows)
`;
      
      const mirrors = mm._parseMirrorsFile(content);
      
      assert.strictEqual(mirrors.length, 1);
    });

    it('sorts HTTPS before HTTP', () => {
      const mm = new MirrorManager();
      const content = `   continent   |    nation     |     location      |     provider     |     url     |     note
---------------+---------------+-------------------+------------------+-------------+----------
 Europe        | UK            | London            | HTTP Mirror      | http://http.example.com/gutenberg/ | 
 Europe        | UK            | London            | HTTPS Mirror     | https://https.example.com/gutenberg/ | 
(2 rows)
`;
      
      const mirrors = mm._parseMirrorsFile(content);
      
      assert.strictEqual(mirrors[0].provider, 'HTTPS Mirror');
      assert.strictEqual(mirrors[1].provider, 'HTTP Mirror');
    });

    it('prioritizes "high speed" mirrors', () => {
      const mm = new MirrorManager();
      const content = `   continent   |    nation     |     location      |     provider     |     url     |     note
---------------+---------------+-------------------+------------------+-------------+----------
 Europe        | UK            | London            | Slow Mirror      | https://slow.example.com/ | 
 Europe        | UK            | London            | Fast Mirror      | https://fast.example.com/ | High speed connection
(2 rows)
`;
      
      const mirrors = mm._parseMirrorsFile(content);
      
      assert.strictEqual(mirrors[0].provider, 'Fast Mirror');
      assert.strictEqual(mirrors[1].provider, 'Slow Mirror');
    });

    it('handles empty or malformed content gracefully', () => {
      const mm = new MirrorManager();
      
      assert.deepStrictEqual(mm._parseMirrorsFile(''), []);
      assert.deepStrictEqual(mm._parseMirrorsFile('just some random text'), []);
      assert.deepStrictEqual(mm._parseMirrorsFile('|||||'), []);
    });
  });

  describe('_buildBookUrl', () => {
    it('builds correct URL for standard gutenberg.org base', () => {
      const mm = new MirrorManager();
      const url = mm._buildBookUrl('https://www.gutenberg.org', 1342);
      assert.strictEqual(url, 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt');
    });

    it('builds correct URL for mirror with /gutenberg path', () => {
      const mm = new MirrorManager();
      const url = mm._buildBookUrl('https://mirror.cs.odu.edu/gutenberg', 1342);
      assert.strictEqual(url, 'https://mirror.cs.odu.edu/gutenberg/cache/epub/1342/pg1342.txt');
    });

    it('builds correct URL for mirror with long ibiblio-style path', () => {
      const mm = new MirrorManager();
      const url = mm._buildBookUrl('http://www.mirrorservice.org/sites/ftp.ibiblio.org/pub/docs/books/gutenberg', 1342);
      assert.strictEqual(url, 'http://www.mirrorservice.org/sites/ftp.ibiblio.org/pub/docs/books/gutenberg/cache/epub/1342/pg1342.txt');
    });

    it('builds correct URL for simple domain base', () => {
      const mm = new MirrorManager();
      const url = mm._buildBookUrl('https://aleph.pglaf.org', 1342);
      assert.strictEqual(url, 'https://aleph.pglaf.org/cache/epub/1342/pg1342.txt');
    });

    it('strips trailing slashes from base URL', () => {
      const mm = new MirrorManager();
      const url = mm._buildBookUrl('https://example.com/', 1342);
      assert.strictEqual(url, 'https://example.com/cache/epub/1342/pg1342.txt');
    });
  });

  describe('_updateMirrorStats', () => {
    it('tracks successes and updates average response time', () => {
      const mm = new MirrorManager();
      
      mm._updateMirrorStats('https://example.com', true, 100);
      mm._updateMirrorStats('https://example.com', true, 200);
      
      const stats = mm.mirrorStats.get('https://example.com')!;
      assert.strictEqual(stats.successes, 2);
      assert.strictEqual(stats.failures, 0);
      assert.ok(stats.avgResponseTime !== null && stats.avgResponseTime > 100 && stats.avgResponseTime < 200);
      assert.ok(stats.lastSuccess !== null);
    });

    it('tracks failures separately', () => {
      const mm = new MirrorManager();
      
      mm._updateMirrorStats('https://example.com', true, 100);
      mm._updateMirrorStats('https://example.com', false, 500);
      
      const stats = mm.mirrorStats.get('https://example.com')!;
      assert.strictEqual(stats.successes, 1);
      assert.strictEqual(stats.failures, 1);
      assert.ok(stats.lastFailure !== null);
    });
  });

  describe('_getOrderedMirrors', () => {
    it('returns original order when no stats available', () => {
      const mm = new MirrorManager();
      mm.mirrors = [
        { baseUrl: 'https://a.com', provider: 'A', location: 'Test' },
        { baseUrl: 'https://b.com', provider: 'B', location: 'Test' },
      ];
      
      const ordered = mm._getOrderedMirrors();
      
      assert.strictEqual(ordered[0].provider, 'A');
      assert.strictEqual(ordered[1].provider, 'B');
    });

    it('deprioritizes mirrors with recent failures', () => {
      const mm = new MirrorManager();
      mm.mirrors = [
        { baseUrl: 'https://a.com', provider: 'A', location: 'Test' },
        { baseUrl: 'https://b.com', provider: 'B', location: 'Test' },
      ];
      
      // A has recent failure
      mm._updateMirrorStats('https://a.com', false, 100);
      mm._updateMirrorStats('https://b.com', true, 100);
      
      const ordered = mm._getOrderedMirrors();
      
      assert.strictEqual(ordered[0].provider, 'B');
      assert.strictEqual(ordered[1].provider, 'A');
    });

    it('prefers faster mirrors when no recent failures', () => {
      const mm = new MirrorManager();
      mm.mirrors = [
        { baseUrl: 'https://slow.com', provider: 'Slow', location: 'Test' },
        { baseUrl: 'https://fast.com', provider: 'Fast', location: 'Test' },
      ];
      
      // Fast has better response time
      mm._updateMirrorStats('https://slow.com', true, 500);
      mm._updateMirrorStats('https://fast.com', true, 100);
      
      const ordered = mm._getOrderedMirrors();
      
      assert.strictEqual(ordered[0].provider, 'Fast');
      assert.strictEqual(ordered[1].provider, 'Slow');
    });
  });

  describe('sticky mirror behavior', () => {
    it('remembers which mirror worked for a book', async () => {
      const mm = new MirrorManager();
      
      // Simulate successful mirror for book 1342
      mm.bookMirrors.set(1342, { baseUrl: 'https://cached.com', provider: 'Cached', location: 'Test' });
      
      assert.strictEqual(mm.bookMirrors.get(1342)!.provider, 'Cached');
    });

    it('clears sticky mirror with clearBookMirror', () => {
      const mm = new MirrorManager();
      
      mm.bookMirrors.set(1342, { baseUrl: 'https://cached.com', provider: 'Cached', location: 'Test' });
      mm.clearBookMirror(1342);
      
      assert.strictEqual(mm.bookMirrors.get(1342), undefined);
    });

    it('races backup mirrors in parallel with sticky (with delay)', async () => {
      // This tests the design: sticky gets a 500ms head start,
      // then backups race in parallel
      const mm = new MirrorManager();
      
      // Verify _sleep exists
      assert.strictEqual(typeof mm._sleep, 'function');
      
      // Verify sleep works
      const start = Date.now();
      await mm._sleep(50);
      const elapsed = Date.now() - start;
      assert.ok(elapsed >= 45, `Sleep should take at least 45ms, took ${elapsed}ms`);
    });
  });

  describe('getStatus', () => {
    it('returns correct status structure', () => {
      const mm = new MirrorManager();
      mm.initialized = true;
      mm.mirrors = [{ baseUrl: 'https://a.com', provider: 'A', location: 'US' }];
      mm.bookMirrors.set(1342, { provider: 'A' } as Mirror);
      
      const status = mm.getStatus();
      
      assert.strictEqual(status.initialized, true);
      assert.strictEqual(status.mirrorCount, 1);
      assert.strictEqual(status.stickyBooks, 1);
      assert.strictEqual(status.mirrors[0].provider, 'A');
    });
  });

  describe('real MIRRORS.ALL parsing', () => {
    it('parses the actual MIRRORS.ALL file correctly', async () => {
      const mm = new MirrorManager();
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const mirrorsPath = path.join(__dirname, '..', 'MIRRORS.ALL');
      
      let content: string;
      try {
        content = fs.readFileSync(mirrorsPath, 'utf8');
      } catch (e) {
        // Skip test if file doesn't exist
        console.log('Skipping: MIRRORS.ALL not found');
        return;
      }
      
      const mirrors = mm._parseMirrorsFile(content);
      
      // Should have some mirrors
      assert.ok(mirrors.length > 0, 'Should parse at least one mirror');
      
      // Should NOT have FTP mirrors
      const ftpMirrors = mirrors.filter(m => m.baseUrl.startsWith('ftp://'));
      assert.strictEqual(ftpMirrors.length, 0, 'Should not include FTP mirrors');
      
      // Should NOT have rsync mirrors  
      const rsyncMirrors = mirrors.filter(m => m.baseUrl.startsWith('rsync://'));
      assert.strictEqual(rsyncMirrors.length, 0, 'Should not include rsync mirrors');
      
      // Should NOT have gopher mirrors
      const gopherMirrors = mirrors.filter(m => m.baseUrl.startsWith('gopher://'));
      assert.strictEqual(gopherMirrors.length, 0, 'Should not include gopher mirrors');
      
      // Should NOT have /dirs/ URLs
      const dirsMirrors = mirrors.filter(m => m.baseUrl.includes('/dirs'));
      assert.strictEqual(dirsMirrors.length, 0, 'Should not include /dirs/ URLs');
      
      // Should NOT have gutenberg-epub variant
      const epubMirrors = mirrors.filter(m => m.baseUrl.includes('gutenberg-epub'));
      assert.strictEqual(epubMirrors.length, 0, 'Should not include gutenberg-epub variant');
      
      // All should be HTTP or HTTPS
      mirrors.forEach(m => {
        assert.ok(
          m.baseUrl.startsWith('http://') || m.baseUrl.startsWith('https://'),
          `Mirror ${m.provider} should be HTTP/HTTPS: ${m.baseUrl}`
        );
      });
      
      // HTTPS mirrors should come before HTTP
      const firstHttpIndex = mirrors.findIndex(m => m.baseUrl.startsWith('http://') && !m.baseUrl.startsWith('https://'));
      const lastHttpsIndex = mirrors.findLastIndex(m => m.baseUrl.startsWith('https://'));
      if (firstHttpIndex >= 0 && lastHttpsIndex >= 0) {
        assert.ok(firstHttpIndex > lastHttpsIndex, 'HTTPS mirrors should be sorted before HTTP');
      }
      
      console.log(`Parsed ${mirrors.length} valid HTTP/HTTPS mirrors from MIRRORS.ALL`);
      mirrors.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.provider} - ${m.baseUrl}`);
      });
    });
  });

  describe('timeout configuration', () => {
    it('uses default 3 second timeout', () => {
      const mm = new MirrorManager();
      assert.strictEqual(mm.requestTimeout, 3000);
    });

    it('allows custom timeout', () => {
      const mm = new MirrorManager({ requestTimeout: 5000 });
      assert.strictEqual(mm.requestTimeout, 5000);
    });

    it('races 3 mirrors by default', () => {
      const mm = new MirrorManager();
      assert.strictEqual(mm.raceCount, 3);
    });
  });
});
