#!/usr/bin/env node
import { spawn } from "child_process";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { StringDecoder } from "string_decoder";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = join(__dirname, "../dist/test");
const reporterPath = join(__dirname, "emoji-reporter.js");

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const esc = {
  save: "\x1b[s",
  restore: "\x1b[u",
  clearLine: "\x1b[K",
  moveToBottom: (rows) => `\x1b[${rows};1H`,
  setScrollRegion: (top, bottom) => `\x1b[${top};${bottom}r`,
  resetScrollRegion: "\x1b[r",
  moveHome: "\x1b[H",
};

const icons = {
  pass: "\u2705",
  fail: "\u274C",
  suite: "\u25B6",
  skip: "\u23ED",
  todo: "\u25CB",
  info: "\u2139",
  time: "\u23F1",
  file: "\u25B8",
  rocket: "\u25BA",
  slow: "\u25E6",
  cancel: "\u26AA",
};

function replaceMarkers(text) {
  return text
    .replace(/\[PASS\]/g, icons.pass + " ")
    .replace(/\[FAIL\]/g, icons.fail + " ")
    .replace(/\[SUITE\]/g, icons.suite + " ")
    .replace(/\[SKIP\]/g, icons.skip + " ")
    .replace(/\[TODO\]/g, icons.todo + " ")
    .replace(/\[INFO\]/g, icons.info + " ")
    .replace(/\[TIME\]/g, icons.time + " ")
    .replace(/\[CANCEL\]/g, icons.cancel + " ");
}

const rows = process.stdout.rows || 24;
const testFiles = readdirSync(testDir).filter(f => f.endsWith(".test.js")).sort();
const totalFiles = testFiles.length;
let completedFiles = 0;
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failedFilesList = [];
const fileTimes = [];
let currentFile = "";

function drawProgressBar(current, total, width = 25) {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  return "\u2593".repeat(filled) + "\u2591".repeat(empty);
}

function updateBottomBar() {
  const percent = Math.round((completedFiles / totalFiles) * 100);
  const bar = drawProgressBar(completedFiles, totalFiles);
  const status = `${icons.rocket} ${c.cyan}[${completedFiles}/${totalFiles}]${c.reset} ${bar} ${c.yellow}${percent}%${c.reset}`;
  const fileInfo = currentFile ? ` ${icons.file} ${c.dim}${currentFile}${c.reset}` : "";
  const stats = ` ${icons.pass} ${c.green}${passedTests}${c.reset} ${icons.fail} ${c.red}${failedTests}${c.reset}`;
  process.stdout.write(esc.save);
  process.stdout.write(esc.moveToBottom(rows));
  process.stdout.write(esc.clearLine);
  process.stdout.write(`${status}${stats}${fileInfo}`);
  process.stdout.write(esc.restore);
}

function setupScreen() {
  process.stdout.write(esc.setScrollRegion(1, rows - 1));
  process.stdout.write(esc.moveHome);
  console.log(`${icons.rocket} ${c.cyan}${c.bold}TEST SUITE${c.reset} ${c.dim}Running ${totalFiles} test files${c.reset}\n`);
  updateBottomBar();
}

function cleanupScreen() {
  process.stdout.write(esc.resetScrollRegion);
  process.stdout.write(esc.moveToBottom(rows));
  process.stdout.write("\n");
}

async function runTestFile(file) {
  return new Promise((resolve) => {
    const filePath = join(testDir, file);
    const startTime = Date.now();
    currentFile = file;
    updateBottomBar();
    console.log(`${icons.file} ${c.white}${c.bold}${file}${c.reset}`);
    const proc = spawn("node", ["--test", "--test-reporter", reporterPath, filePath], {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "1" }
    });
    let output = "";
    const decoder = new StringDecoder("utf8");
    proc.stdout.on("data", (data) => {
      const text = decoder.write(data);
      output += text;
      process.stdout.write(replaceMarkers(text));
      updateBottomBar();
    });
    proc.stdout.on("end", () => {
      const remaining = decoder.end();
      if (remaining) {
        output += remaining;
        process.stdout.write(replaceMarkers(remaining));
      }
    });
    proc.stderr.on("data", (data) => {
      process.stderr.write(data);
    });
    proc.on("close", (code) => {
      const elapsed = Date.now() - startTime;
      fileTimes.push({ file, elapsed });
      const testsMatch = output.match(/\[INFO\] tests (\d+)/);
      const passMatch = output.match(/\[PASS\] pass (\d+)/);
      const failMatch = output.match(/\[FAIL\] fail (\d+)/);
      if (testsMatch) totalTests += parseInt(testsMatch[1]);
      if (passMatch) passedTests += parseInt(passMatch[1]);
      if (failMatch) {
        const failed = parseInt(failMatch[1]);
        failedTests += failed;
        if (failed > 0) failedFilesList.push(file);
      }
      completedFiles++;
      updateBottomBar();
      console.log();
      resolve(code);
    });
  });
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main() {
  const startTime = Date.now();
  setupScreen();
  for (let i = 0; i < testFiles.length; i++) {
    await runTestFile(testFiles[i]);
  }
  cleanupScreen();
  const totalTime = Date.now() - startTime;
  console.log(`${c.dim}${"\u2500".repeat(50)}${c.reset}`);
  console.log();
  if (failedTests === 0) {
    console.log(`${icons.pass} ${c.green}${c.bold}All tests passed${c.reset}`);
  } else {
    console.log(`${icons.fail} ${c.red}${c.bold}Some tests failed${c.reset}`);
  }
  console.log();
  console.log(`  ${icons.file} ${c.bold}Files:${c.reset}    ${completedFiles}/${totalFiles}`);
  console.log(`  ${icons.info} ${c.bold}Tests:${c.reset}    ${totalTests}`);
  console.log(`  ${icons.pass} ${c.green}Passed:${c.reset}   ${passedTests}`);
  if (failedTests > 0) {
    console.log(`  ${icons.fail} ${c.red}Failed:${c.reset}   ${failedTests}`);
  }
  console.log(`  ${icons.time} ${c.bold}Time:${c.reset}     ${formatTime(totalTime)}`);
  if (failedFilesList.length > 0) {
    console.log();
    console.log(`  ${icons.fail} ${c.red}${c.bold}Failed files:${c.reset}`);
    failedFilesList.forEach(f => console.log(`     ${c.red}\u2192${c.reset} ${f}`));
  }
  const slowest = [...fileTimes].sort((a, b) => b.elapsed - a.elapsed).slice(0, 3);
  if (slowest.length > 0 && slowest[0].elapsed > 500) {
    console.log();
    console.log(`  ${icons.slow} ${c.dim}Slowest:${c.reset}`);
    slowest.forEach(({ file, elapsed }) => {
      console.log(`     ${c.dim}${formatTime(elapsed).padStart(8)}${c.reset}  ${file}`);
    });
  }
  console.log();
  console.log(`${c.dim}${"\u2500".repeat(50)}${c.reset}`);
  console.log();
  process.exit(failedTests > 0 ? 1 : 0);
}

main();
