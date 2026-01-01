/**
 * Catalog Manager Module
 * Handles downloading and searching the Project Gutenberg catalog
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createGunzip } from 'zlib';
import https from 'https';
import { fileURLToPath } from 'url';
import type { CatalogRecord, CatalogMeta, SearchResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CatalogManager {
  private catalogUrl = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz';
  private cacheDir = path.join(__dirname, '..', '.cache');
  private catalogPath = path.join(this.cacheDir, 'pg_catalog.csv');
  private metaPath = path.join(this.cacheDir, 'pg_catalog.meta.json');
  private checkIntervalMs = 60 * 60 * 1000;
  
  // In-memory cache for parsed catalog records
  private _cachedRecords: CatalogRecord[] | null = null;
  private _cachedRecordsPath: string | null = null;
  
  // Optional logging callback for server integration
  private _logCallback: ((type: string, message: string) => void) | null = null;
  
  /**
   * Set a callback for logging events (catalog refresh, etc.)
   */
  setLogCallback(callback: (type: string, message: string) => void): void {
    this._logCallback = callback;
  }
  
  private _log(type: string, message: string): void {
    if (this._logCallback) {
      this._logCallback(type, message);
    }
  }

  async ensureCatalog(forceRefresh = false): Promise<void> {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    const shouldRefresh = forceRefresh || this._shouldCheckForUpdates();

    if (!fs.existsSync(this.catalogPath)) {
      this._log('catalog', 'Catalog not found, downloading...');
      await this._downloadCatalog();
      return;
    }

    if (shouldRefresh) {
      this._log('catalog', 'Checking for catalog updates...');
      const hasChanged = await this._hasRemoteChanged();
      if (hasChanged) {
        this._log('catalog', 'Catalog has changed, downloading update...');
        await this._downloadCatalog();
      } else {
        this._log('catalog', 'Catalog is up to date');
        this._updateMeta({ lastCheck: Date.now() });
      }
    }
  }

  searchCatalog(query: string, languageFilter: string | null = null): SearchResult[] {
    const records = this._getCachedRecords();
    if (records.length === 0) {
      throw new Error('Catalog not available. Run with --refresh-catalog to download.');
    }

    const results: SearchResult[] = [];

    // Split query into words and require all to match (AND logic)
    const queryWords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 0);
    if (queryWords.length === 0) return results;

    for (const record of records) {
      if (record.id && record.title) {
        // Filter by language if specified
        if (languageFilter && record.language !== languageFilter) {
          continue;
        }
        // Check for exact ID match first
        if (record.id === query.trim()) {
          results.push({ id: record.id, title: record.title, author: record.author, year: record.year, language: record.language });
          continue;
        }
        // Otherwise search title and author
        const searchText = [record.title, record.author || ''].join(' ').toLowerCase();
        const allMatch = queryWords.every((word: string) => searchText.includes(word));
        if (allMatch) {
          results.push({ id: record.id, title: record.title, author: record.author, year: record.year, language: record.language });
        }
      }
    }

    return results;
  }

  getBookById(bookId: number | string): CatalogRecord | null {
    const records = this._getCachedRecords();
    if (records.length === 0) return null;
    
    const idStr = String(bookId);

    for (const record of records) {
      if (record.id === idStr) {
        return { id: record.id, title: record.title, author: record.author, year: record.year, language: record.language };
      }
    }

    return null;
  }

  /**
   * Get cached catalog records, parsing from disk only once
   */
  private _getCachedRecords(): CatalogRecord[] {
    if (!fs.existsSync(this.catalogPath)) {
      return [];
    }
    
    // Invalidate cache if catalog file changed
    if (this._cachedRecords && this._cachedRecordsPath === this.catalogPath) {
      return this._cachedRecords;
    }
    
    const content = fs.readFileSync(this.catalogPath, 'utf-8');
    this._cachedRecords = this._parseCSV(content);
    this._cachedRecordsPath = this.catalogPath;
    return this._cachedRecords;
  }
  
  /**
   * Invalidate the in-memory cache (called after catalog download)
   */
  private _invalidateCache(): void {
    this._cachedRecords = null;
    this._cachedRecordsPath = null;
  }

  getRandomBook(languageFilter: string | null = 'en'): CatalogRecord | null {
    let records = this._getCachedRecords();
    if (records.length === 0) return null;

    // Filter by language if specified
    if (languageFilter) {
      records = records.filter(r => r.language === languageFilter);
    }

    if (records.length === 0) return null;

    const idx = Math.floor(Math.random() * records.length);
    const record = records[idx];
    return { id: record.id, title: record.title, author: record.author, year: record.year, language: record.language };
  }

  private _parseCSV(content: string): CatalogRecord[] {
    const records: CatalogRecord[] = [];
    let currentRecord: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < content.length) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = !inQuotes;
          i++;
          continue;
        }
      }

      if (!inQuotes && char === ',') {
        currentRecord.push(currentField);
        currentField = '';
        i++;
        continue;
      }

      if (!inQuotes && (char === '\n' || char === '\r')) {
        if (currentField || currentRecord.length > 0) {
          currentRecord.push(currentField);

          // CSV columns: 0=Text#, 1=Type, 2=Issued, 3=Title, 4=Language, 5=Authors
          if (currentRecord.length >= 4) {
            const id = currentRecord[0];
            const issued = currentRecord[2] || '';
            const title = currentRecord[3]
              .replace(/\n/g, ' ')
              .replace(/\r/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            const language = (currentRecord[4] || '')
              .replace(/\n/g, ' ')
              .replace(/\r/g, '')
              .trim();
            const author = (currentRecord[5] || '')
              .replace(/\n/g, ' ')
              .replace(/\r/g, '')
              .replace(/\s+/g, ' ')
              .trim();

            // Extract year from issued date
            const yearMatch = issued.match(/^\d{4}/);
            const year = yearMatch ? yearMatch[0] : null;

            if (id && title) {
              records.push({ id, title, author: author || null, year, language: language || null });
            }
          }

          currentRecord = [];
          currentField = '';
        }

        if (char === '\r' && nextChar === '\n') {
          i += 2;
        } else {
          i++;
        }
        continue;
      }

      currentField += char;
      i++;
    }

    if (currentField || currentRecord.length > 0) {
      currentRecord.push(currentField);
      if (currentRecord.length >= 4) {
        const id = currentRecord[0];
        const issued = currentRecord[2] || '';
        const title = currentRecord[3]
          .replace(/\n/g, ' ')
          .replace(/\r/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const language = (currentRecord[4] || '')
          .replace(/\n/g, ' ')
          .replace(/\r/g, '')
          .trim();
        const author = (currentRecord[5] || '')
          .replace(/\n/g, ' ')
          .replace(/\r/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        const yearMatch = issued.match(/^\d{4}/);
        const year = yearMatch ? yearMatch[0] : null;

        if (id && title) {
          records.push({ id, title, author: author || null, year, language: language || null });
        }
      }
    }

    return records;
  }

  private _shouldCheckForUpdates(): boolean {
    if (!fs.existsSync(this.metaPath)) {
      return true;
    }

    try {
      const meta: CatalogMeta = JSON.parse(fs.readFileSync(this.metaPath, 'utf-8'));
      const timeSinceCheck = Date.now() - (meta.lastCheck || 0);
      return timeSinceCheck > this.checkIntervalMs;
    } catch {
      return true;
    }
  }

  private async _hasRemoteChanged(): Promise<boolean> {
    if (!fs.existsSync(this.catalogPath) || !fs.existsSync(this.metaPath)) {
      return true;
    }

    try {
      const meta: CatalogMeta = JSON.parse(fs.readFileSync(this.metaPath, 'utf-8'));
      const localHash = meta.sha256;
      const remoteHash = await this._computeRemoteHash();
      return localHash !== remoteHash;
    } catch (err) {
      console.error(`Warning: Could not check for updates: ${(err as Error).message}`);
      return false;
    }
  }

  private _computeRemoteHash(): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');

      https.get(this.catalogUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const gunzip = createGunzip();

        response
          .pipe(gunzip)
          .on('data', (chunk: Buffer) => hash.update(chunk))
          .on('end', () => resolve(hash.digest('hex')))
          .on('error', reject);
      }).on('error', reject);
    });
  }

  private async _downloadCatalog(): Promise<void> {
    console.log('📦 Downloading Gutenberg catalog...');

    const tempPath = this.catalogPath + '.tmp';
    const hash = crypto.createHash('sha256');

    return new Promise((resolve, reject) => {
      https.get(this.catalogUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const gunzip = createGunzip();
        const fileStream = fs.createWriteStream(tempPath);

        response
          .pipe(gunzip)
          .on('data', (chunk: Buffer) => hash.update(chunk))
          .pipe(fileStream)
          .on('finish', () => {
            const sha256 = hash.digest('hex');
            fs.renameSync(tempPath, this.catalogPath);
            this._updateMeta({
              sha256,
              downloadDate: new Date().toISOString(),
              lastCheck: Date.now()
            });
            this._invalidateCache();
            console.log('✓ Catalog downloaded successfully\n');
            this._log('catalog', `Gutenberg index refreshed (${new Date().toISOString()})`);
            resolve();
          })
          .on('error', (err: Error) => {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
            reject(err);
          });
      }).on('error', reject);
    });
  }

  private _updateMeta(updates: Partial<CatalogMeta>): void {
    let meta: CatalogMeta = {};

    if (fs.existsSync(this.metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(this.metaPath, 'utf-8'));
      } catch {}
    }

    Object.assign(meta, updates);
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
  }
}
