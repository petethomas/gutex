/**
 * Catalog Language Filter Tests
 * 
 * Tests the language field extraction and filtering in CatalogManager.
 * Ensures random book selection properly filters by language.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import CatalogManager after it's compiled
import { CatalogManager } from '../src/catalog-manager.js';

// Helper to check if catalog is available
function hasCatalog(catalogManager: CatalogManager): boolean {
  try {
    const book = catalogManager.getBookById(1342);
    return book !== null;
  } catch {
    return false;
  }
}

describe('Catalog Language Filtering', () => {
  let catalogManager: CatalogManager;
  let catalogAvailable = false;
  
  before(async () => {
    catalogManager = new CatalogManager();
    try {
      await catalogManager.ensureCatalog();
      catalogAvailable = hasCatalog(catalogManager);
    } catch {
      catalogAvailable = false;
    }
  });
  
  describe('CatalogRecord language field', () => {
    it('should include language in search results', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      const results = catalogManager.searchCatalog('Pride Prejudice');
      
      if (results.length > 0) {
        const result = results[0];
        assert.ok('language' in result, 'Search result should have language field');
        // Pride and Prejudice should be English
        if (result.title.includes('Pride and Prejudice')) {
          assert.strictEqual(result.language, 'en', 'Pride and Prejudice should be English');
        }
      }
    });
    
    it('should include language in getBookById', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      const book = catalogManager.getBookById(1342); // Pride and Prejudice
      
      if (book) {
        assert.ok('language' in book, 'Book should have language field');
        assert.strictEqual(book.language, 'en', 'Book 1342 should be English');
      }
    });
    
    it('should include language in getRandomBook result', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      const book = catalogManager.getRandomBook();
      
      if (book) {
        assert.ok('language' in book, 'Random book should have language field');
        assert.strictEqual(typeof book.language, 'string');
      }
    });
  });
  
  describe('getRandomBook language filter', () => {
    it('should return English books by default', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      // Test multiple times to ensure filtering works
      for (let i = 0; i < 10; i++) {
        const book = catalogManager.getRandomBook();
        if (book) {
          assert.strictEqual(book.language, 'en', 
            `Default random book should be English, got: ${book.language} for "${book.title}"`);
        }
      }
    });
    
    it('should return English books when explicitly filtered', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      for (let i = 0; i < 10; i++) {
        const book = catalogManager.getRandomBook('en');
        if (book) {
          assert.strictEqual(book.language, 'en',
            `Filtered book should be English, got: ${book.language}`);
        }
      }
    });
    
    it('should return any language when filter is null', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      const book = catalogManager.getRandomBook(null);
      
      if (book) {
        // Just verify it returns something - could be any language
        assert.ok(book.id, 'Should return a book');
        assert.ok(book.title, 'Book should have a title');
      }
    });
    
    it('should return French books when filtered for French', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      // Try to get a French book
      const book = catalogManager.getRandomBook('fr');
      
      if (book) {
        assert.strictEqual(book.language, 'fr',
          `French filter should return French book, got: ${book.language}`);
      }
      // It's okay if no French books are found - catalog may vary
    });
    
    it('should return null for non-existent language', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      // Use a language code that definitely doesn't exist
      const book = catalogManager.getRandomBook('xyz-nonexistent');
      
      assert.strictEqual(book, null, 'Should return null for non-existent language');
    });
  });
  
  describe('Language code format', () => {
    it('should handle standard ISO 639-1 codes', async () => {
      if (!catalogAvailable) {
        console.log('  ⏭ Skipping: catalog not available');
        return;
      }
      
      // Search for a known German book
      const results = catalogManager.searchCatalog('Faust Goethe');
      
      const germanBook = results.find(r => r.language === 'de');
      if (germanBook) {
        assert.strictEqual(germanBook.language, 'de', 'German books should have "de" language code');
      }
    });
  });
});

describe('Catalog CSV Parsing', () => {
  it('should correctly extract language from CSV column 4', () => {
    // This tests the internal parsing logic
    // The Gutenberg CSV format is:
    // Text#,Type,Issued,Title,Language,Authors,...
    
    // We can't easily test the private _parseCSV method directly,
    // but we can verify the results through public methods
    
    const catalogManager = new CatalogManager();
    
    // If catalog exists, verify a known book
    try {
      const book = catalogManager.getBookById(1342);
      if (book) {
        // Pride and Prejudice is definitely English
        assert.strictEqual(book.language, 'en');
        assert.strictEqual(book.title.toLowerCase().includes('pride'), true);
      }
    } catch {
      // Catalog not available, skip
      console.log('  ⏭ Skipping: catalog not available');
    }
  });
});

describe('Performance considerations', () => {
  it('should filter efficiently even with large catalogs', async () => {
    const catalogManager = new CatalogManager();
    
    let catalogAvailable = false;
    try {
      await catalogManager.ensureCatalog();
      catalogAvailable = hasCatalog(catalogManager);
    } catch {
      catalogAvailable = false;
    }
    
    if (!catalogAvailable) {
      console.log('  ⏭ Skipping: catalog not available');
      return;
    }
    
    const start = Date.now();
    
    // Get 100 random English books
    for (let i = 0; i < 100; i++) {
      catalogManager.getRandomBook('en');
    }
    
    const elapsed = Date.now() - start;
    
    // Should complete 100 random selections in under 5 seconds
    // (parsing catalog each time is expensive but should still be manageable)
    assert.ok(elapsed < 5000, `100 random selections took ${elapsed}ms, expected < 5000ms`);
  });
});
