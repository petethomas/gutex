export class Cleaner {
  static START_MARKERS = [
    '*** START OF THIS PROJECT GUTENBERG',
    '*** START OF THE PROJECT GUTENBERG',
    '*END*THE SMALL PRINT',
  ];

  static END_MARKERS = [
    '*** END OF THIS PROJECT GUTENBERG',
    '*** END OF THE PROJECT GUTENBERG',
    'End of the Project Gutenberg',
    'End of Project Gutenberg',
  ];

  static async findCleanBoundaries(fetcher) {
    const totalBytes = await fetcher.getFileSize();
    
    // Fetch beginning and end chunks to find markers
    const headBuffer = await fetcher.fetchRange(0, Math.min(3000, totalBytes - 1));
    const tailBuffer = await fetcher.fetchRange(Math.max(0, totalBytes - 3000), totalBytes - 1);
    
    const headChunk = headBuffer.toString('utf8');
    const tailChunk = tailBuffer.toString('utf8');

    const startByte = this._findStartBoundary(headChunk);
    const endByte = totalBytes - this._findEndBoundary(tailChunk);

    return {
      startByte: startByte || 0,
      endByte: endByte || totalBytes,
      cleanLength: (endByte || totalBytes) - (startByte || 0)
    };
  }

  static _findStartBoundary(text) {
    for (const marker of this.START_MARKERS) {
      const idx = text.indexOf(marker);
      if (idx !== -1) {
        // Find the next newline after marker
        const nextNewline = text.indexOf('\n', idx + marker.length);
        if (nextNewline !== -1) {
          return nextNewline + 1;
        }
      }
    }
    return null;
  }

  static _findEndBoundary(text) {
    for (const marker of this.END_MARKERS) {
      const idx = text.indexOf(marker);
      if (idx !== -1) {
        return text.length - idx;
      }
    }
    return null;
  }

  static extractWords(text, startWordIndex, wordCount) {
    // Split on whitespace, filter empty strings
    const words = text.split(/\s+/).filter(word => word.length > 0);
    
    // Extract the exact slice requested
    const extracted = words.slice(startWordIndex, startWordIndex + wordCount);
    
    return {
      words: extracted,
      actualCount: extracted.length,
      totalWordsInChunk: words.length
    };
  }

  static countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
}
