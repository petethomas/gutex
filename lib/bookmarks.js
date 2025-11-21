import fs from "fs";
import os from "os";
import path from "path";

const BOOKMARKS_FILE = path.join(os.homedir(), ".gutex_bookmarks.json");

function loadBookmarks() {
  if (!fs.existsSync(BOOKMARKS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(BOOKMARKS_FILE, "utf-8")) || {};
  } catch {
    return {};
  }
}

function saveBookmarks(data) {
  fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(data, null, 2));
}

export function saveBookmark(name, info) {
  const all = loadBookmarks();
  all[name] = info;
  saveBookmarks(all);
}

export function loadBookmark(name) {
  const all = loadBookmarks();
  return all[name];
}

export function listBookmarks() {
  return loadBookmarks();
}