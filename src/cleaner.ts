/**
 * Project Gutenberg boilerplate stripper.
 *
 * Handles edge cases including:
 * - Multiple marker formats (with/without spaces around ***)
 * - PG Australia variant
 * - Old "SMALL PRINT" disclaimer blocks
 * - Post-start junk (PRODUCED BY, TRANSCRIBED BY, etc.)
 * - Fuzzy matching for OCR errors / typos
 * - Various encoding artifacts (BOM, etc.)
 */

import type { Boundaries, CleanerOptions, StartBoundaryResult, EndBoundaryResult, FetcherStats } from './types.js';

// Fetcher interface for dependency injection
interface FetcherInterface {
  getFileSize(): Promise<number>;
  fetchRange(start: number, end: number): Promise<Buffer>;
  getStats?(): FetcherStats;
}

export const DEFAULT_OPTS: Required<CleanerOptions> = {
  scanHeadLines: 1200,     // how far into the file we search for the start
  scanTailLines: 1200,     // how far from the end we search for the footer
  maxFuzzyDist: 6,         // allowed edit distance for fuzzy marker matches
  maxPrefixWindow: 120,    // only fuzzy-compare within the first N chars of a line
  headScanBytes: 60000,    // bytes to fetch for head scan (~1200 lines * 50 bytes avg)
  tailScanBytes: 60000     // bytes to fetch for tail scan
};

// Normalize line for comparison: uppercase, collapse whitespace, strip punctuation
export function normalizeLine(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toUpperCase()
    .replace(/\uFEFF/g, '')          // BOM
    .replace(/[^\w\s*]/g, ' ')       // turn punctuation into spaces (preserve *)
    .replace(/\s+/g, ' ')
    .trim();
}

// Bounded Levenshtein distance - returns maxDist+1 if exceeded
export function boundedLevenshtein(a: string, b: string, maxDist: number): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > maxDist) return maxDist + 1;
  if (al === 0) return bl <= maxDist ? bl : maxDist + 1;
  if (bl === 0) return al <= maxDist ? al : maxDist + 1;

  // Ensure b is the shorter string
  if (bl > al) return boundedLevenshtein(b, a, maxDist);

  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);

  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);

    const from = Math.max(1, i - maxDist);
    const to = Math.min(bl, i + maxDist);

    if (from > to) return maxDist + 1;

    for (let j = 1; j < from; j++) curr[j] = maxDist + 1;

    for (let j = from; j <= to; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;

      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;

      const v = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }

    for (let j = to + 1; j <= bl; j++) curr[j] = maxDist + 1;

    if (rowMin > maxDist) return maxDist + 1;

    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[bl];
}

// Check if normalized line matches marker (exact substring or fuzzy)
export function fuzzyMarkerMatch(lineNorm: string, markerNorm: string, opts: Required<CleanerOptions>): boolean {
  if (!lineNorm) return false;

  // Fast path: substring match
  if (lineNorm.includes(markerNorm)) return true;

  // Fuzzy compare against a prefix window of the line
  const window = lineNorm.slice(0, opts.maxPrefixWindow);

  // Try a few start offsets to survive leading "***" / extra words
  const maxOffset = Math.min(12, Math.max(0, window.length - markerNorm.length));
  for (let off = 0; off <= maxOffset; off++) {
    const chunk = window.slice(off, off + markerNorm.length);
    if (!chunk) break;
    const d = boundedLevenshtein(chunk, markerNorm, opts.maxFuzzyDist);
    if (d <= opts.maxFuzzyDist) return true;
  }

  return false;
}

export function anyFuzzy(lineNorm: string, markersNorm: string[], opts: Required<CleanerOptions>): boolean {
  for (const m of markersNorm) {
    if (fuzzyMarkerMatch(lineNorm, m, opts)) return true;
  }
  return false;
}

// Marker patterns - ONLY explicit START markers to avoid matching headers
export const START_MARKERS: string[] = [
  '*** START OF THIS PROJECT GUTENBERG EBOOK',
  '*** START OF THE PROJECT GUTENBERG EBOOK',
  '***START OF THIS PROJECT GUTENBERG EBOOK',
  '***START OF THE PROJECT GUTENBERG EBOOK',
  'START OF THIS PROJECT GUTENBERG EBOOK',
  'START OF THE PROJECT GUTENBERG EBOOK',
  'START OF THE PROJECT GUTENBERG'
];

// Old disclaimer block markers
export const SMALL_PRINT_MARKERS: string[] = [
  '***START**THE SMALL PRINT',
  'SMALL PRINT',
  'START THE SMALL PRINT'
];

export const END_MARKERS: string[] = [
  '*** END OF THIS PROJECT GUTENBERG EBOOK',
  '*** END OF THE PROJECT GUTENBERG EBOOK',
  '***END OF THIS PROJECT GUTENBERG EBOOK',
  '***END OF THE PROJECT GUTENBERG EBOOK',
  'END OF THIS PROJECT GUTENBERG EBOOK',
  'END OF THE PROJECT GUTENBERG EBOOK',
  'END OF PROJECT GUTENBERG',
  'END OF THE PROJECT GUTENBERG',
  'END OF PROJECT GUTENBERG ETEXT',
  'END OF THE PROJECT GUTENBERG ETEXT',
  "END OF PROJECT GUTENBERG'S",
  '***END***',
  '*** END ***',
  'END OF THIS EBOOK',
  'END OF THE EBOOK',
  'THIS IS A COPYRIGHTED PROJECT GUTENBERG',
  'SUBSCRIBING TO OUR EMAIL NEWSLETTER',
  'SUBSCRIBE TO OUR FREE',
  'DONATION TO PROJECT GUTENBERG',
  'DONATIONS TO PROJECT GUTENBERG',
  'INFORMATION ABOUT DONATIONS',
  'MOST RECENTLY UPDATED',
  'UPDATED EDITIONS WILL REPLACE',
  'CREATING THE WORKS FROM',
  'YOU CAN ALWAYS EMAIL DIRECTLY TO'
];

// PG Australia specific markers
export const AUS_HINTS: string[] = [
  'PROJECT GUTENBERG AUSTRALIA',
  'A PROJECT GUTENBERG OF AUSTRALIA EBOOK'
];

export const AUS_CUTOFFS: string[] = [
  'TO CONTACT PROJECT GUTENBERG OF AUSTRALIA',
  'GUTENBERG.NET.AU'
];

// Lines to skip after finding the start marker
export const POST_START_JUNK: string[] = [
  'PRODUCED BY',
  'TRANSCRIBED BY',
  'DIGITIZED BY',
  'PROOFREAD',
  'UPDATED EDITIONS',
  'DISTRIBUTED PROOFREADERS',
  'THIS EBOOK IS FOR THE USE OF ANYONE',
  'COPYRIGHT',
  'PROJECT GUTENBERG LICENSE',
  'WWW.GUTENBERG.ORG',
  'ONLINE DISTRIBUTED PROOFREADING',
  'INTERNET ARCHIVE',
  'PREPARED BY',
  'SCANNED BY',
  'E TEXT PREPARED BY',
  'ETEXT PREPARED BY'
];

// Legalese section markers
export const LEGALESE_START_MARKERS: string[] = [
  'THE FULL PROJECT GUTENBERG LICENSE',
  'PLEASE READ THIS BEFORE YOU DISTRIBUTE',
  'START OF THE PROJECT GUTENBERG LICENSE',
  'START: FULL LICENSE',
  'SECTION 1. GENERAL TERMS OF USE',
  'PROJECT GUTENBERG-TM LICENSE',
  'PROJECT GUTENBERG TM LICENSE',
  'THIS AND ALL ASSOCIATED FILES',
  'A COVERAGE OF THE PROJECT GUTENBERG',
  'PROJECT GUTENBERG LITERARY ARCHIVE',
  'TRADEMARK LICENSE',
  'TRADEMARK/COPYRIGHT',
  'TERMS OF USE AND REDISTRIBUTION',
  'REDISTRIBUTION IS SUBJECT',
  'SPECIAL RULES, SET FORTH BELOW',
  'PROJECT GUTENBERG IS A REGISTERED TRADEMARK',
  'VOLUNTEER SUPPORT',
  'DONATIONS TO THE PROJECT GUTENBERG'
];

// Check for post-start junk using EXACT substring matching
export function matchesPostStartJunk(lineNorm: string, postStartJunkNorm: string[]): boolean {
  for (const junk of postStartJunkNorm) {
    if (lineNorm.includes(junk)) return true;
  }
  return false;
}

// Check for AUS cutoffs using EXACT substring matching
export function matchesAusCutoff(lineNorm: string, ausCutoffsNorm: string[]): boolean {
  for (const cutoff of ausCutoffsNorm) {
    if (lineNorm.includes(cutoff)) return true;
  }
  return false;
}

// Check if a line looks like a continuation of credit/producer info
function looksLikeCreditContinuation(lineNorm: string, prevWasJunk: boolean): boolean {
  if (!prevWasJunk) return false;
  if (!lineNorm) return false;

  // Clear continuations
  if (lineNorm.startsWith('AND ')) return true;
  if (lineNorm.includes('@')) return true;
  if (lineNorm.includes('HTTP') || lineNorm.includes('WWW ')) return true;

  // Content indicators - stop skipping
  const contentIndicators = [
    'CHAPTER', 'PART', 'BOOK', 'VOLUME', 'SECTION',
    'ACT', 'SCENE', 'PROLOGUE', 'EPILOGUE', 'PREFACE',
    'INTRODUCTION', 'CONTENTS', 'INDEX', 'DEDICATION'
  ];
  for (const indicator of contentIndicators) {
    if (lineNorm.includes(indicator)) return false;
  }

  // Roman numerals by themselves are often chapter numbers
  if (/^[IVXLC]+$/.test(lineNorm)) return false;

  // If the line is ALL CAPS and has more than 2 words, it's likely a title
  const words = lineNorm.split(/\s+/).filter((w: string) => w.length > 0);
  if (words.length >= 2) {
    const hasComma = lineNorm.includes(',');
    if (!hasComma) return false;
  }

  return false;
}

export class Cleaner {
  // Legacy markers for backward compatibility
  static START_MARKERS = START_MARKERS.slice(0, 3);
  static END_MARKERS = END_MARKERS.slice(0, 4);
  static DEFAULT_OPTS = DEFAULT_OPTS;

  /**
   * Find clean content boundaries using advanced marker detection.
   */
  static async findCleanBoundaries(fetcher: FetcherInterface, userOpts: CleanerOptions = {}): Promise<Boundaries> {
    const opts: Required<CleanerOptions> = { ...DEFAULT_OPTS, ...userOpts };
    const totalBytes = await fetcher.getFileSize();

    const headSize = Math.min(opts.headScanBytes, totalBytes);
    const tailStart = Math.max(0, totalBytes - opts.tailScanBytes);

    const headBuffer = await fetcher.fetchRange(0, headSize - 1);
    const tailBuffer = await fetcher.fetchRange(tailStart, totalBytes - 1);

    const headText = headBuffer.toString('utf8');
    const tailText = tailBuffer.toString('utf8');

    const startInfo = this._findStartBoundaryAdvanced(headText, opts);
    const endInfo = this._findEndBoundaryAdvanced(tailText, opts);

    const startByte = startInfo.byteOffset || 0;
    const endByteFromTail = endInfo.byteOffset !== null
      ? tailStart + endInfo.byteOffset
      : totalBytes;

    return {
      startByte,
      endByte: endByteFromTail,
      cleanLength: endByteFromTail - startByte,
      meta: {
        isAustralian: startInfo.isAustralian,
        hadSmallPrint: startInfo.hadSmallPrint,
        startMarkerFound: startInfo.found,
        endMarkerFound: endInfo.found
      }
    };
  }

  /**
   * Advanced start boundary detection with fuzzy matching.
   */
  static _findStartBoundaryAdvanced(text: string, opts: Required<CleanerOptions> = DEFAULT_OPTS): StartBoundaryResult {
    const originalLines = text.split('\n');
    const normalizedLines = originalLines.map((line: string) => line.replace(/\r$/, ''));
    const lines = normalizedLines;
    const headMax = Math.min(lines.length, opts.scanHeadLines);

    const startMarkersNorm = START_MARKERS.map(normalizeLine);
    const ausHintsNorm = AUS_HINTS.map(normalizeLine);
    const ausCutoffsNorm = AUS_CUTOFFS.map(normalizeLine);
    const postStartJunkNorm = POST_START_JUNK.map(normalizeLine);

    // Detect PG Australia
    let isAUS = false;
    for (let i = 0; i < headMax; i++) {
      const ln = normalizeLine(lines[i]);
      if (!ln) continue;
      if (anyFuzzy(ln, ausHintsNorm, opts)) {
        isAUS = true;
        break;
      }
    }

    let startIdx = 0;
    let hadSmallPrint = false;

    if (isAUS) {
      // PG Australia: start after the contact/license block
      let cutoff = -1;
      for (let i = 0; i < headMax; i++) {
        const ln = normalizeLine(lines[i]);
        if (!ln) continue;
        if (matchesAusCutoff(ln, ausCutoffsNorm)) {
          cutoff = i;
          break;
        }
      }
      if (cutoff !== -1) {
        startIdx = cutoff + 1;
        while (startIdx < lines.length) {
          const n = normalizeLine(lines[startIdx]);
          if (!n) {
            startIdx++;
            continue;
          }
          if (n.startsWith('TITLE ') || n.startsWith('TITLE:') ||
              n.startsWith('AUTHOR ') || n.startsWith('AUTHOR:')) {
            startIdx++;
            continue;
          }
          break;
        }
      }
    } else {
      // Standard PG: find START marker
      let found = -1;
      const smallPrintMarkersNorm = SMALL_PRINT_MARKERS.map(normalizeLine);

      for (let i = 0; i < headMax; i++) {
        const ln = normalizeLine(lines[i]);
        if (!ln) continue;

        // Skip lines containing END
        if (ln.includes('END OF PROJECT') || ln.includes('END OF THE PROJECT')) {
          continue;
        }

        // Skip *END*THE SMALL PRINT lines
        if (ln.includes('*END*') && ln.includes('SMALL PRINT')) {
          continue;
        }

        // Check for explicit START markers
        if (anyFuzzy(ln, startMarkersNorm, opts)) {
          found = i;
          break;
        }

        // Check for SMALL PRINT markers
        for (const spMarker of smallPrintMarkersNorm) {
          if (ln.includes(spMarker)) {
            found = i;
            hadSmallPrint = true;
            break;
          }
        }
        if (hadSmallPrint) break;
      }

      if (found !== -1) {
        startIdx = found + 1;

        const foundNorm = normalizeLine(lines[found]);

        // Handle SMALL PRINT section
        if (foundNorm.includes('SMALL PRINT')) {
          hadSmallPrint = true;
          const isEndMarker = foundNorm.includes('*END*');
          const isStartMarker = foundNorm.includes('***START') || foundNorm.includes('*BEFORE') || foundNorm.startsWith('START');

          if (isEndMarker && !isStartMarker) {
            // Already at end of section
          } else if (isStartMarker) {
            // Find end of SMALL PRINT section
            for (let i = startIdx; i < headMax; i++) {
              const ln = normalizeLine(lines[i]);
              if (!ln) continue;
              if (ln.includes('*END*') && ln.includes('SMALL PRINT')) {
                startIdx = i + 1;
                break;
              }
              if (ln.startsWith('***')) {
                startIdx = i + 1;
                break;
              }
              if (anyFuzzy(ln, startMarkersNorm, opts) && !ln.includes('SMALL PRINT')) {
                startIdx = i + 1;
                break;
              }
            }
          }
        }

        // Skip post-start junk
        let prevWasJunk = false;
        while (startIdx < lines.length) {
          const n = normalizeLine(lines[startIdx]);
          if (!n) {
            startIdx++;
            continue;
          }

          const isJunk = matchesPostStartJunk(n, postStartJunkNorm);
          const isContinuation = looksLikeCreditContinuation(n, prevWasJunk);

          if (isJunk || isContinuation) {
            prevWasJunk = isJunk;
            startIdx++;
            continue;
          }
          break;
        }
      } else {
        // Heuristic fallback
        let i = 0;
        while (i < headMax) {
          const n = normalizeLine(lines[i]);
          if (!n) {
            i++;
            continue;
          }
          const looksBoilerplate =
            n.includes('PROJECT GUTENBERG') ||
            n.includes('THIS EBOOK IS FOR THE USE OF ANYONE') ||
            n.includes('LICENSE') ||
            n.includes('COPYRIGHT') ||
            n.includes('PRODUCED BY');
          if (!looksBoilerplate) break;
          i++;
        }
        startIdx = i;
      }
    }

    // Calculate byte offset
    let byteOffset = 0;
    for (let i = 0; i < startIdx && i < originalLines.length; i++) {
      byteOffset += Buffer.byteLength(originalLines[i], 'utf8') + 1;
    }

    return {
      byteOffset,
      lineIndex: startIdx,
      found: startIdx > 0,
      isAustralian: isAUS,
      hadSmallPrint
    };
  }

  /**
   * Advanced end boundary detection - scans FORWARD to find the FIRST footer marker.
   */
  static _findEndBoundaryAdvanced(text: string, opts: Required<CleanerOptions> = DEFAULT_OPTS): EndBoundaryResult {
    const originalLines = text.split('\n');
    const normalizedLines = originalLines.map((line: string) => line.replace(/\r$/, ''));
    const lines = normalizedLines;

    const endMarkersNorm = END_MARKERS.map(normalizeLine);
    const legaleseStartNorm = LEGALESE_START_MARKERS.map(normalizeLine);

    let endIdx = lines.length;
    let found = false;

    // PASS 1: Explicit END markers
    for (let i = 0; i < lines.length; i++) {
      const ln = normalizeLine(lines[i]);
      if (!ln) continue;

      if (ln.includes('*** END OF') || ln.includes('***END OF')) {
        if (ln.includes('PROJECT GUTENBERG') || ln.includes('GUTENBERG EBOOK')) {
          endIdx = i;
          found = true;
          break;
        }
      }

      if (ln.startsWith('END OF PROJECT GUTENBERG') ||
          ln.startsWith('END OF THE PROJECT GUTENBERG') ||
          ln.startsWith('END OF THIS PROJECT GUTENBERG')) {
        endIdx = i;
        found = true;
        break;
      }
    }

    // PASS 2: Footer section starts
    if (!found) {
      for (let i = 0; i < lines.length; i++) {
        const ln = normalizeLine(lines[i]);
        if (!ln) continue;

        if (anyFuzzy(ln, legaleseStartNorm, opts)) {
          endIdx = i;
          found = true;
          break;
        }

        if (/^\*{3,}\s*$/.test(ln) || /^\*\s*\*\s*\*\s*$/.test(ln)) {
          let hasFooterContent = false;
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const lookahead = normalizeLine(lines[j]);
            if (lookahead && (
              lookahead.includes('END OF') && lookahead.includes('PROJECT GUTENBERG') ||
              lookahead.startsWith('UPDATED EDITIONS WILL REPLACE') ||
              lookahead.startsWith('THIS EBOOK IS FOR THE USE OF') ||
              lookahead.startsWith('THE FULL PROJECT GUTENBERG LICENSE')
            )) {
              hasFooterContent = true;
              break;
            }
          }
          if (hasFooterContent) {
            endIdx = i;
            found = true;
            break;
          }
        }

        if (ln.startsWith('UPDATED EDITIONS WILL REPLACE') ||
            ln.startsWith('THIS EBOOK IS FOR THE USE OF ANYONE') ||
            ln.startsWith('THE FULL PROJECT GUTENBERG LICENSE') ||
            ln.startsWith('START FULL LICENSE') ||
            ln.startsWith('PLEASE READ THIS BEFORE YOU DISTRIBUTE')) {
          endIdx = i;
          found = true;
          break;
        }
      }
    }

    // PASS 3: Fuzzy matching
    if (!found) {
      for (let i = 0; i < lines.length; i++) {
        const ln = normalizeLine(lines[i]);
        if (!ln) continue;

        if (anyFuzzy(ln, endMarkersNorm, opts)) {
          endIdx = i;
          found = true;
          break;
        }
      }
    }

    // Calculate byte offset
    let byteOffset = 0;
    for (let i = 0; i < endIdx && i < originalLines.length; i++) {
      byteOffset += Buffer.byteLength(originalLines[i], 'utf8') + 1;
    }

    return {
      byteOffset: found ? byteOffset : null,
      lineIndex: endIdx,
      found
    };
  }

  /**
   * Legacy method for backward compatibility.
   */
  static _findStartBoundary(text: string): number | null {
    for (const marker of this.START_MARKERS) {
      const idx = text.indexOf(marker);
      if (idx !== -1) {
        const nextNewline = text.indexOf('\n', idx + marker.length);
        if (nextNewline !== -1) {
          return nextNewline + 1;
        }
      }
    }
    return null;
  }

  /**
   * Legacy method for backward compatibility.
   */
  static _findEndBoundary(text: string): number | null {
    for (const marker of this.END_MARKERS) {
      const idx = text.indexOf(marker);
      if (idx !== -1) {
        return text.length - idx;
      }
    }
    return null;
  }

  /**
   * Strip boilerplate from complete text (non-streaming use case).
   */
  static stripBoilerplate(text: string, userOpts: CleanerOptions = {}): string {
    const opts: Required<CleanerOptions> = { ...DEFAULT_OPTS, ...userOpts };

    if (typeof text !== 'string' || text.length === 0) return '';

    const lines = text.replace(/\r/g, '').split('\n');
    const headMax = Math.min(lines.length, opts.scanHeadLines);

    const startMarkersNorm = START_MARKERS.map(normalizeLine);
    const endMarkersNorm = END_MARKERS.map(normalizeLine);
    const ausHintsNorm = AUS_HINTS.map(normalizeLine);
    const ausCutoffsNorm = AUS_CUTOFFS.map(normalizeLine);
    const postStartJunkNorm = POST_START_JUNK.map(normalizeLine);
    const legaleseStartNorm = LEGALESE_START_MARKERS.map(normalizeLine);

    // Detect PG Australia
    let isAUS = false;
    for (let i = 0; i < headMax; i++) {
      const ln = normalizeLine(lines[i]);
      if (!ln) continue;
      if (anyFuzzy(ln, ausHintsNorm, opts)) {
        isAUS = true;
        break;
      }
    }

    // Find start index
    let startIdx = 0;

    if (isAUS) {
      let cutoff = -1;
      for (let i = 0; i < headMax; i++) {
        const ln = normalizeLine(lines[i]);
        if (!ln) continue;
        if (matchesAusCutoff(ln, ausCutoffsNorm)) {
          cutoff = i;
          break;
        }
      }
      if (cutoff !== -1) {
        startIdx = cutoff + 1;
        while (startIdx < lines.length) {
          const n = normalizeLine(lines[startIdx]);
          if (!n) {
            startIdx++;
            continue;
          }
          if (n.startsWith('TITLE ') || n.startsWith('TITLE:') ||
              n.startsWith('AUTHOR ') || n.startsWith('AUTHOR:')) {
            startIdx++;
            continue;
          }
          break;
        }
      }
    } else {
      let found = -1;
      let hadSmallPrint = false;
      const smallPrintMarkersNorm = SMALL_PRINT_MARKERS.map(normalizeLine);

      for (let i = 0; i < headMax; i++) {
        const ln = normalizeLine(lines[i]);
        if (!ln) continue;

        if (ln.includes('END OF PROJECT') || ln.includes('END OF THE PROJECT')) {
          continue;
        }

        if (ln.includes('*END*') && ln.includes('SMALL PRINT')) {
          continue;
        }

        if (anyFuzzy(ln, startMarkersNorm, opts)) {
          found = i;
          break;
        }

        for (const spMarker of smallPrintMarkersNorm) {
          if (ln.includes(spMarker)) {
            found = i;
            hadSmallPrint = true;
            break;
          }
        }
        if (hadSmallPrint) break;
      }

      if (found !== -1) {
        startIdx = found + 1;

        const foundNorm = normalizeLine(lines[found]);

        if (foundNorm.includes('SMALL PRINT')) {
          const isEndMarker = foundNorm.includes('*END*');
          const isStartMarker = foundNorm.includes('***START') || foundNorm.includes('*BEFORE') || foundNorm.startsWith('START');

          if (isEndMarker && !isStartMarker) {
            // Already at end
          } else if (isStartMarker) {
            for (let i = startIdx; i < headMax; i++) {
              const ln = normalizeLine(lines[i]);
              if (!ln) continue;
              if (ln.includes('*END*') && ln.includes('SMALL PRINT')) {
                startIdx = i + 1;
                break;
              }
              if (ln.startsWith('***')) {
                startIdx = i + 1;
                break;
              }
              if (anyFuzzy(ln, startMarkersNorm, opts) && !ln.includes('SMALL PRINT')) {
                startIdx = i + 1;
                break;
              }
            }
          }
        }

        let prevWasJunk = false;
        while (startIdx < lines.length) {
          const n = normalizeLine(lines[startIdx]);
          if (!n) {
            startIdx++;
            continue;
          }

          const isJunk = matchesPostStartJunk(n, postStartJunkNorm);
          const isContinuation = looksLikeCreditContinuation(n, prevWasJunk);

          if (isJunk || isContinuation) {
            prevWasJunk = isJunk;
            startIdx++;
            continue;
          }
          break;
        }
      } else {
        let i = 0;
        while (i < headMax) {
          const n = normalizeLine(lines[i]);
          if (!n) {
            i++;
            continue;
          }
          const looksBoilerplate =
            n.includes('PROJECT GUTENBERG') ||
            n.includes('THIS EBOOK IS FOR THE USE OF ANYONE') ||
            n.includes('LICENSE') ||
            n.includes('COPYRIGHT') ||
            n.includes('PRODUCED BY');
          if (!looksBoilerplate) break;
          i++;
        }
        startIdx = i;
      }
    }

    // Find end index - scan FORWARD
    let endIdx = lines.length;

    for (let i = startIdx; i < lines.length; i++) {
      const ln = normalizeLine(lines[i]);
      if (!ln) continue;

      if (anyFuzzy(ln, endMarkersNorm, opts)) {
        endIdx = i;
        break;
      }

      if (ln.startsWith('END OF PROJECT GUTENBERG') ||
          ln.startsWith('END OF THE PROJECT GUTENBERG') ||
          ln.startsWith('END THE PROJECT GUTENBERG')) {
        endIdx = i;
        break;
      }

      if (anyFuzzy(ln, legaleseStartNorm, opts)) {
        endIdx = i;
        break;
      }

      if (/^\*{3,}\s*$/.test(ln) || /^\*\s*\*\s*\*/.test(ln)) {
        let hasFooterContent = false;
        for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
          const lookahead = normalizeLine(lines[j]);
          if (lookahead && (
            lookahead.includes('PROJECT GUTENBERG') ||
            lookahead.includes('GUTENBERG TM') ||
            lookahead.includes('GUTENBERG-TM') ||
            lookahead.includes('THIS EBOOK') ||
            lookahead.includes('DONATE') ||
            lookahead.includes('LICENSE') ||
            lookahead.includes('TRADEMARK')
          )) {
            hasFooterContent = true;
            break;
          }
        }
        if (hasFooterContent) {
          endIdx = i;
          break;
        }
      }

      if (ln.includes('THIS EBOOK IS FOR THE USE OF ANYONE') ||
          ln.includes('PROJECT GUTENBERG TM') ||
          ln.includes('PROJECT GUTENBERG-TM') ||
          (ln.includes('GUTENBERG EBOOK') && ln.includes('THIS')) ||
          ln.includes('GUTENBERG LITERARY ARCHIVE') ||
          ln.includes('WWW GUTENBERG ORG') ||
          (ln.includes('GUTENBERG ORG') && ln.includes('DONATE'))) {
        endIdx = i;
        break;
      }
    }

    if (startIdx >= endIdx) return '';

    return lines.slice(startIdx, endIdx).join('\n').trim();
  }

  // Utility methods
  static extractWords(text: string, startWordIndex: number, wordCount: number): { words: string[]; actualCount: number; totalWordsInChunk: number } {
    const words = text.split(/\s+/).filter((word: string) => word.length > 0);
    const extracted = words.slice(startWordIndex, startWordIndex + wordCount);

    return {
      words: extracted,
      actualCount: extracted.length,
      totalWordsInChunk: words.length
    };
  }

  static countWords(text: string): number {
    return text.split(/\s+/).filter((word: string) => word.length > 0).length;
  }
}
