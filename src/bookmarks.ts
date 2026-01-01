/**
 * Bookmarks Module
 * Handles saving and loading reading positions
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { BookmarkInfo, BookmarksData } from './types.js';

const BOOKMARKS_FILE = path.join(os.homedir(), '.gutex_bookmarks.json');

function loadBookmarks(): BookmarksData {
  if (!fs.existsSync(BOOKMARKS_FILE)) return {};
  try {
    const content = fs.readFileSync(BOOKMARKS_FILE, 'utf-8');
    return JSON.parse(content) || {};
  } catch {
    return {};
  }
}

function saveBookmarksData(data: BookmarksData): void {
  fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(data, null, 2));
}

export function saveBookmark(name: string, info: BookmarkInfo): void {
  const all = loadBookmarks();
  all[name] = info;
  saveBookmarksData(all);
}

export function loadBookmark(name: string): BookmarkInfo | undefined {
  const all = loadBookmarks();
  return all[name];
}

export function deleteBookmark(name: string): boolean {
  const all = loadBookmarks();
  if (all[name]) {
    delete all[name];
    saveBookmarksData(all);
    return true;
  }
  return false;
}

export function listBookmarks(): BookmarksData {
  return loadBookmarks();
}
