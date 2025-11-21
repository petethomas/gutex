import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createGunzip } from 'zlib';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CatalogManager {
  constructor() {
    this.catalogUrl = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz';
    this.cacheDir = path.join(__dirname, '..', '.cache');
    this.catalogPath = path.join(this.cacheDir, 'pg_catalog.csv');
    this.metaPath = path.join(this.cacheDir, 'pg_catalog.meta.json');
    this.checkIntervalMs = 24 * 60 * 60 * 1000;
  }

  async ensureCatalog(forceRefresh = false) {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    const shouldRefresh = forceRefresh || this._shouldCheckForUpdates();

    if (!fs.existsSync(this.catalogPath)) {
      await this._downloadCatalog();
      return;
    }

    if (shouldRefresh) {
      const hasChanged = await this._hasRemoteChanged();
      if (hasChanged) {
        await this._downloadCatalog();
      } else {
        this._updateMeta({ lastCheck: Date.now() });
      }
    }
  }

  searchCatalog(query) {
    if (!fs.existsSync(this.catalogPath)) {
      throw new Error('Catalog not available. Run with --refresh-catalog to download.');
    }

    const content = fs.readFileSync(this.catalogPath, 'utf-8');
    const records = this._parseCSV(content);
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (const record of records) {
      if (record.id && record.title) {
        if (record.title.toLowerCase().includes(lowerQuery)) {
          results.push({ id: record.id, title: record.title });
        }
      }
    }

    return results;
  }

  _parseCSV(content) {
    const records = [];
    let currentRecord = [];
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
          
          if (currentRecord.length >= 4) {
            const id = currentRecord[0];
            const title = currentRecord[3]
              .replace(/\n/g, ' ')
              .replace(/\r/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            
            if (id && title) {
              records.push({ id, title });
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
        const title = currentRecord[3]
          .replace(/\n/g, ' ')
          .replace(/\r/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (id && title) {
          records.push({ id, title });
        }
      }
    }

    return records;
  }

  _shouldCheckForUpdates() {
    if (!fs.existsSync(this.metaPath)) {
      return true;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(this.metaPath, 'utf-8'));
      const timeSinceCheck = Date.now() - (meta.lastCheck || 0);
      return timeSinceCheck > this.checkIntervalMs;
    } catch (err) {
      return true;
    }
  }

  async _hasRemoteChanged() {
    if (!fs.existsSync(this.catalogPath) || !fs.existsSync(this.metaPath)) {
      return true;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(this.metaPath, 'utf-8'));
      const localHash = meta.sha256;
      const remoteHash = await this._computeRemoteHash();
      return localHash !== remoteHash;
    } catch (err) {
      console.error(`Warning: Could not check for updates: ${err.message}`);
      return false;
    }
  }

  async _computeRemoteHash() {
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
          .on('data', (chunk) => hash.update(chunk))
          .on('end', () => resolve(hash.digest('hex')))
          .on('error', reject);
      }).on('error', reject);
    });
  }

  async _downloadCatalog() {
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
          .on('data', (chunk) => hash.update(chunk))
          .pipe(fileStream)
          .on('finish', () => {
            const sha256 = hash.digest('hex');
            fs.renameSync(tempPath, this.catalogPath);
            this._updateMeta({
              sha256,
              downloadDate: new Date().toISOString(),
              lastCheck: Date.now()
            });
            console.log('✓ Catalog downloaded successfully\n');
            resolve();
          })
          .on('error', (err) => {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
            reject(err);
          });
      }).on('error', reject);
    });
  }

  _updateMeta(updates) {
    let meta = {};
    
    if (fs.existsSync(this.metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(this.metaPath, 'utf-8'));
      } catch (err) {}
    }

    Object.assign(meta, updates);
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
  }
}
