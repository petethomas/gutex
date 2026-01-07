// @ts-nocheck
const state = {
  bookId: null,
  bookTitle: null,
  bookAuthor: null,
  byteStart: 0,
  byteEnd: 0,
  nextByteStart: null,
  docStart: 0,       // Start of document content (for backward boundary check)
  docEnd: 0,         // End of document content
  chunkSize: 200,
  loading: false,
  lastFetchDuration: null
};

const autoRead = {
  active: false,
  intervalId: null,
  minInterval: 1000
};

// Jump Around mode state
const jumpAround = {
  active: false,
  sameBook: false,  // true = same book only, false = global random
  timeoutId: null,
  countdownId: null,
  nextJumpTime: null,
  interval: 60000   // 60 seconds
};

// Jump Around mode functions
