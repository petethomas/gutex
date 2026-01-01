import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { CatalogManager } from '../src/catalog-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const gutexPath = join(__dirname, '..', 'src', 'gutex.js');

const TEST_CATALOG = `Text#,Type,Issued,Title,Language,Authors
1,Text,1971-12-01,The Declaration of Independence,en,"Jefferson, Thomas"
11,Text,2008-06-27,Alice's Adventures in Wonderland,en,"Carroll, Lewis"
12,Text,2008-06-25,Through the Looking-Glass,en,"Carroll, Lewis"
996,Text,1999-01-01,"Don Quixote
by Miguel de Cervantes",es,"Cervantes, Miguel de"
1342,Text,1998-06-01,Pride and Prejudice,en,"Austen, Jane"`;

describe('Catalog Lookup Tests', () => {
  let catalogManager: CatalogManager;
  let testCacheDir: string;

  before(async () => {
    testCacheDir = join(__dirname, '..', '.cache-test');
    
    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir, { recursive: true });
    }
    
    const catalogPath = join(testCacheDir, 'pg_catalog.csv');
    fs.writeFileSync(catalogPath, TEST_CATALOG);
    
    const metaPath = join(testCacheDir, 'pg_catalog.meta.json');
    fs.writeFileSync(metaPath, JSON.stringify({
      sha256: 'test-hash',
      downloadDate: new Date().toISOString(),
      lastCheck: Date.now()
    }));
    
    catalogManager = new CatalogManager();
    (catalogManager as any).cacheDir = testCacheDir;
    (catalogManager as any).catalogPath = catalogPath;
    (catalogManager as any).metaPath = metaPath;
  });

  after(() => {
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  describe('CatalogManager', () => {
    it('should search by exact title match', () => {
      const results = catalogManager.searchCatalog('Alice');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, '11');
    });

    it('should search case-insensitively', () => {
      const results = catalogManager.searchCatalog('ALICE');
      assert.strictEqual(results.length, 1);
    });

    it('should find partial matches', () => {
      const results = catalogManager.searchCatalog('Look');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, '12');
    });

    it('should return empty array for no matches', () => {
      const results = catalogManager.searchCatalog('zzzznonexistent');
      assert.strictEqual(results.length, 0);
    });

    it('should handle multi-line titles', () => {
      const results = catalogManager.searchCatalog('Quixote');
      assert.strictEqual(results.length, 1);
      assert.ok(!results[0].title.includes('\n'));
    });

    it('should search by author name', () => {
      const results = catalogManager.searchCatalog('Austen');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, '1342');
      assert.strictEqual(results[0].title, 'Pride and Prejudice');
    });

    it('should match both title and author in single query', () => {
      const results = catalogManager.searchCatalog('Carroll');
      assert.strictEqual(results.length, 2);
    });

    it('should match author name in any order', () => {
      // "Lewis Carroll" should match "Carroll, Lewis" in author field
      const results = catalogManager.searchCatalog('Lewis Carroll');
      assert.strictEqual(results.length, 2);
      assert.ok(results.every(r => r.author!.includes('Carroll')));
    });
  });

  describe('CLI --lookup flag', () => {
    before(() => {
      const mainCache = join(__dirname, '..', '.cache');
      const backupCache = join(__dirname, '..', '.cache-backup');
      
      // Clean up any existing backup first
      if (fs.existsSync(backupCache)) {
        fs.rmSync(backupCache, { recursive: true, force: true });
      }
      
      if (fs.existsSync(mainCache)) {
        fs.renameSync(mainCache, backupCache);
      }
      
      fs.cpSync(testCacheDir, mainCache, { recursive: true });
    });

    after(() => {
      const mainCache = join(__dirname, '..', '.cache');
      const backupCache = join(__dirname, '..', '.cache-backup');
      
      if (fs.existsSync(mainCache)) {
        fs.rmSync(mainCache, { recursive: true, force: true });
      }
      
      if (fs.existsSync(backupCache)) {
        fs.renameSync(backupCache, mainCache);
      }
    });

    it('should show results for valid search', (t, done) => {
      const child = spawn('node', [gutexPath, '--lookup', 'Alice']);
      
      let stdout = '';
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      child.on('close', (code) => {
        assert.strictEqual(code, 0);
        assert.ok(stdout.includes('[11]'));
        assert.ok(stdout.includes('Alice'));
        done();
      });
    });

    it('should require search string argument', (t, done) => {
      const child = spawn('node', [gutexPath, '--lookup']);
      
      let stderr = '';
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        assert.strictEqual(code, 1);
        assert.ok(stderr.includes('requires a search string'));
        done();
      });
    });
  });
});
