// @ts-nocheck
// ========== State management ==========
interface SearchResult {
  id: string;
  title: string;
  author?: string;
}

interface FulltextMatch {
  matchStart: number;
  matchEnd: number;
  contextBefore: string;
  contextAfter: string;
  matchText: string;
  wordPosition: number;
  bytePosition: number;
}

interface FulltextState {
  bookId: number | null;
  bookTitle: string;
  bookAuthor: string;
  fullText: string;
  words: string[];
  wordBytePositions: number[];
  results: FulltextMatch[];
  loading: boolean;
}

let selectedIndex = -1;
let currentResults: SearchResult[] = [];

// Fulltext search state
const fulltextState: FulltextState = {
  bookId: null,
  bookTitle: '',
  bookAuthor: '',
  fullText: '',
  words: [],
  wordBytePositions: [],
  results: [],
  loading: false
};

// Context view state
const contextState = {
  currentMatch: null as FulltextMatch | null,
  contextWords: 100
};
