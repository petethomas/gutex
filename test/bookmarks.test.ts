import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { saveBookmark, loadBookmark, listBookmarks } from '../src/bookmarks.js';
import type { BookmarkInfo } from '../src/types.js';

const BOOKMARKS_FILE = path.join(os.homedir(), '.gutex_bookmarks.json');
const BACKUP_FILE = path.join(os.homedir(), '.gutex_bookmarks.json.backup');

describe('Bookmarks Module', () => {
  let originalBookmarks: string | null = null;

  beforeEach(() => {
    // Backup existing bookmarks file
    if (fs.existsSync(BOOKMARKS_FILE)) {
      originalBookmarks = fs.readFileSync(BOOKMARKS_FILE, 'utf-8');
      fs.renameSync(BOOKMARKS_FILE, BACKUP_FILE);
    }
  });

  afterEach(() => {
    // Restore original bookmarks file
    if (fs.existsSync(BOOKMARKS_FILE)) {
      fs.unlinkSync(BOOKMARKS_FILE);
    }
    if (fs.existsSync(BACKUP_FILE)) {
      fs.renameSync(BACKUP_FILE, BOOKMARKS_FILE);
    }
  });

  describe('saveBookmark', () => {
    it('should save a bookmark', () => {
      const info: BookmarkInfo = {
        bookId: 1342,
        position: 5000,
        percent: '25.0',
        timestamp: Date.now()
      };
      
      saveBookmark('Test Bookmark', info);
      
      const loaded = loadBookmark('Test Bookmark');
      assert.ok(loaded);
      assert.strictEqual(loaded.bookId, 1342);
      assert.strictEqual(loaded.position, 5000);
      assert.strictEqual(loaded.percent, '25.0');
    });

    it('should overwrite existing bookmark with same name', () => {
      const info1: BookmarkInfo = {
        bookId: 100,
        position: 1000,
        percent: '10.0',
        timestamp: Date.now()
      };
      
      const info2: BookmarkInfo = {
        bookId: 200,
        position: 2000,
        percent: '20.0',
        timestamp: Date.now()
      };
      
      saveBookmark('Overwrite Test', info1);
      saveBookmark('Overwrite Test', info2);
      
      const loaded = loadBookmark('Overwrite Test');
      assert.ok(loaded);
      assert.strictEqual(loaded.bookId, 200);
    });

    it('should store additional metadata', () => {
      const info: BookmarkInfo = {
        bookId: 84,
        position: 10000,
        percent: '50.0',
        timestamp: Date.now(),
        title: 'Frankenstein',
        author: 'Mary Shelley',
        chunkSize: 150
      };
      
      saveBookmark('Frankenstein Bookmark', info);
      
      const loaded = loadBookmark('Frankenstein Bookmark');
      assert.ok(loaded);
      assert.strictEqual(loaded.title, 'Frankenstein');
      assert.strictEqual(loaded.author, 'Mary Shelley');
      assert.strictEqual(loaded.chunkSize, 150);
    });
  });

  describe('loadBookmark', () => {
    it('should return undefined for non-existent bookmark', () => {
      const loaded = loadBookmark('Does Not Exist');
      assert.strictEqual(loaded, undefined);
    });

    it('should load saved bookmark', () => {
      const info: BookmarkInfo = {
        bookId: 11,
        position: 500,
        percent: '5.0',
        timestamp: 1234567890
      };
      
      saveBookmark('Alice', info);
      const loaded = loadBookmark('Alice');
      
      assert.ok(loaded);
      assert.strictEqual(loaded.bookId, 11);
    });
  });

  describe('listBookmarks', () => {
    it('should return empty object when no bookmarks', () => {
      const all = listBookmarks();
      assert.deepStrictEqual(all, {});
    });

    it('should return all saved bookmarks', () => {
      saveBookmark('Book1', {
        bookId: 1,
        position: 100,
        percent: '10.0',
        timestamp: Date.now()
      });
      
      saveBookmark('Book2', {
        bookId: 2,
        position: 200,
        percent: '20.0',
        timestamp: Date.now()
      });
      
      const all = listBookmarks();
      
      assert.ok(all['Book1']);
      assert.ok(all['Book2']);
      assert.strictEqual(Object.keys(all).length, 2);
    });
  });

  describe('persistence', () => {
    it('should persist bookmarks to disk', () => {
      saveBookmark('Persistent', {
        bookId: 999,
        position: 9999,
        percent: '99.0',
        timestamp: Date.now()
      });
      
      assert.ok(fs.existsSync(BOOKMARKS_FILE));
      
      const content = fs.readFileSync(BOOKMARKS_FILE, 'utf-8');
      const data = JSON.parse(content);
      
      assert.ok(data['Persistent']);
      assert.strictEqual(data['Persistent'].bookId, 999);
    });
  });
});

describe('Bookmarks - Edge Cases', () => {
  const BACKUP_FILE = path.join(os.homedir(), '.gutex_bookmarks.json.backup');

  beforeEach(() => {
    if (fs.existsSync(BOOKMARKS_FILE)) {
      fs.renameSync(BOOKMARKS_FILE, BACKUP_FILE);
    }
  });

  afterEach(() => {
    if (fs.existsSync(BOOKMARKS_FILE)) {
      fs.unlinkSync(BOOKMARKS_FILE);
    }
    if (fs.existsSync(BACKUP_FILE)) {
      fs.renameSync(BACKUP_FILE, BOOKMARKS_FILE);
    }
  });

  it('should handle bookmark names with special characters', () => {
    const info: BookmarkInfo = {
      bookId: 123,
      position: 1000,
      percent: '10.0',
      timestamp: Date.now()
    };
    
    saveBookmark('Book "Title" — 50% @ 3:45 PM', info);
    
    const loaded = loadBookmark('Book "Title" — 50% @ 3:45 PM');
    assert.ok(loaded);
    assert.strictEqual(loaded.bookId, 123);
  });

  it('should handle unicode in bookmark names', () => {
    const info: BookmarkInfo = {
      bookId: 456,
      position: 2000,
      percent: '20.0',
      timestamp: Date.now()
    };
    
    saveBookmark('Les Misérables 📚 — начало', info);
    
    const loaded = loadBookmark('Les Misérables 📚 — начало');
    assert.ok(loaded);
    assert.strictEqual(loaded.bookId, 456);
  });
});
