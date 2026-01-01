/**
 * Last Position Module
 * Persists the user's last reading position across sessions
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

export interface LastPosition {
  bookId: number;
  byteStart: number;
  chunkSize: number;
  mode?: '2d' | '3d';
  timestamp: number;
  bookTitle?: string;
  percent?: number;
}

const LAST_POS_FILE = path.join(os.homedir(), '.gutex_lastpos.json');

export function saveLastPosition(pos: LastPosition): void {
  try {
    fs.writeFileSync(LAST_POS_FILE, JSON.stringify(pos, null, 2));
  } catch (err) {
    console.error('Failed to save last position:', err);
  }
}

export function loadLastPosition(): LastPosition | null {
  if (!fs.existsSync(LAST_POS_FILE)) return null;
  try {
    const content = fs.readFileSync(LAST_POS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function clearLastPosition(): void {
  try {
    if (fs.existsSync(LAST_POS_FILE)) {
      fs.unlinkSync(LAST_POS_FILE);
    }
  } catch (err) {
    console.error('Failed to clear last position:', err);
  }
}
