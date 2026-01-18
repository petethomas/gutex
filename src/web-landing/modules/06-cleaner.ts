// @ts-nocheck
// ========== Client-side Gutenberg boilerplate stripper ==========
// Simplified version of the server-side Cleaner for client-side use

const START_MARKERS = [
  '*** START OF THIS PROJECT GUTENBERG EBOOK',
  '*** START OF THE PROJECT GUTENBERG EBOOK',
  '***START OF THIS PROJECT GUTENBERG EBOOK',
  '***START OF THE PROJECT GUTENBERG EBOOK',
  'START OF THIS PROJECT GUTENBERG EBOOK',
  'START OF THE PROJECT GUTENBERG EBOOK',
  'START OF THE PROJECT GUTENBERG'
];

const END_MARKERS = [
  '*** END OF THIS PROJECT GUTENBERG EBOOK',
  '*** END OF THE PROJECT GUTENBERG EBOOK',
  '***END OF THIS PROJECT GUTENBERG EBOOK',
  '***END OF THE PROJECT GUTENBERG EBOOK',
  'END OF THIS PROJECT GUTENBERG EBOOK',
  'END OF THE PROJECT GUTENBERG EBOOK',
  'END OF PROJECT GUTENBERG',
  'END OF THE PROJECT GUTENBERG',
  '***END***',
  '*** END ***',
  'END OF THIS EBOOK',
  'END OF THE EBOOK'
];

const POST_START_JUNK = [
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
  'ONLINE DISTRIBUTED PROOFREADING'
];

const LEGALESE_MARKERS = [
  'THE FULL PROJECT GUTENBERG LICENSE',
  'PLEASE READ THIS BEFORE YOU DISTRIBUTE',
  'START OF THE PROJECT GUTENBERG LICENSE',
  'PROJECT GUTENBERG-TM LICENSE',
  'PROJECT GUTENBERG TM LICENSE',
  'TERMS OF USE AND REDISTRIBUTION',
  'DONATIONS TO THE PROJECT GUTENBERG'
];

function normalizeLine(s: string): string {
  if (!s) return '';
  return s
    .toUpperCase()
    .replace(/\uFEFF/g, '')
    .replace(/[^\w\s*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripGutenbergBoilerplate(text: string): { cleanText: string; startOffset: number; endOffset: number } {
  if (!text || text.length === 0) {
    return { cleanText: '', startOffset: 0, endOffset: 0 };
  }
  
  const lines = text.replace(/\r/g, '').split('\n');
  const headMax = Math.min(lines.length, 1200);
  
  // Find start index
  let startIdx = 0;
  let foundStart = -1;
  
  for (let i = 0; i < headMax; i++) {
    const ln = normalizeLine(lines[i]);
    if (!ln) continue;
    
    // Skip END markers that appear in header
    if (ln.includes('END OF PROJECT') || ln.includes('END OF THE PROJECT')) continue;
    
    // Check for start markers
    for (const marker of START_MARKERS) {
      if (ln.includes(normalizeLine(marker))) {
        foundStart = i;
        break;
      }
    }
    if (foundStart !== -1) break;
  }
  
  if (foundStart !== -1) {
    startIdx = foundStart + 1;
    
    // Skip post-start junk (producer credits, etc.)
    while (startIdx < lines.length) {
      const ln = normalizeLine(lines[startIdx]);
      if (!ln) {
        startIdx++;
        continue;
      }
      
      let isJunk = false;
      for (const junk of POST_START_JUNK) {
        if (ln.includes(normalizeLine(junk))) {
          isJunk = true;
          break;
        }
      }
      
      if (!isJunk) break;
      startIdx++;
    }
  }
  
  // Find end index
  let endIdx = lines.length;
  
  for (let i = startIdx; i < lines.length; i++) {
    const ln = normalizeLine(lines[i]);
    if (!ln) continue;
    
    // Check end markers
    for (const marker of END_MARKERS) {
      if (ln.includes(normalizeLine(marker))) {
        endIdx = i;
        break;
      }
    }
    if (endIdx !== lines.length) break;
    
    // Check legalese markers
    for (const marker of LEGALESE_MARKERS) {
      if (ln.includes(normalizeLine(marker))) {
        endIdx = i;
        break;
      }
    }
    if (endIdx !== lines.length) break;
    
    // Check for triple asterisks followed by footer content
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
          lookahead.includes('LICENSE')
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
  }
  
  if (startIdx >= endIdx) {
    return { cleanText: text, startOffset: 0, endOffset: text.length };
  }
  
  // Calculate byte offsets
  let startOffset = 0;
  for (let i = 0; i < startIdx; i++) {
    startOffset += lines[i].length + 1; // +1 for newline
  }
  
  let endOffset = startOffset;
  for (let i = startIdx; i < endIdx; i++) {
    endOffset += lines[i].length + 1;
  }
  
  const cleanText = lines.slice(startIdx, endIdx).join('\n').trim();
  
  return { cleanText, startOffset, endOffset };
}

// Build word positions for mapping back to byte positions
function buildWordPositions(text: string): { words: string[]; positions: number[] } {
  const words: string[] = [];
  const positions: number[] = [];
  
  let currentPos = 0;
  const regex = /\S+/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    words.push(match[0]);
    positions.push(currentPos + match.index);
  }
  
  return { words, positions };
}
