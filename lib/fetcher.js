import https from 'https';

export class Fetcher {
  constructor(bookId, debug = false) {
    this.bookId = bookId;
    this.baseUrl = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
    this.totalBytes = null;
    this.debug = debug;
    this.requestCount = 0;
    this.totalBytesDownloaded = 0;
  }

  async getFileSize() {
    if (this.totalBytes !== null) return this.totalBytes;
    
    return new Promise((resolve, reject) => {
      const req = https.request(this.baseUrl, { method: 'HEAD' }, (res) => {
        if (res.statusCode === 200 && res.headers['content-length']) {
          this.totalBytes = parseInt(res.headers['content-length'], 10);
          resolve(this.totalBytes);
        } else {
          reject(new Error(`Book ${this.bookId} not found or unavailable`));
        }
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }

  async fetchRange(startByte, endByte, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this._doFetch(startByte, endByte);
      } catch (err) {
        if (attempt === retries - 1) throw err;
        await this._sleep(500 * (attempt + 1));
      }
    }
  }

  _doFetch(startByte, endByte) {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'Range': `bytes=${startByte}-${endByte}`
        }
      };

      this.requestCount++;
      const requestSize = endByte - startByte + 1;
      this.totalBytesDownloaded += requestSize;
      
      if (this.debug) {
        console.error(`[HTTP] Request #${this.requestCount}: bytes ${startByte}-${endByte} (${requestSize} bytes)`);
      }

      https.get(this.baseUrl, options, (res) => {
        if (res.statusCode !== 206 && res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getStats() {
    return {
      requests: this.requestCount,
      bytesDownloaded: this.totalBytesDownloaded,
      totalBytes: this.totalBytes,
      efficiency: this.totalBytes ? ((this.totalBytesDownloaded / this.totalBytes) * 100).toFixed(2) + '%' : 'N/A'
    };
  }
}
