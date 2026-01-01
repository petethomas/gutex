#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '..');
const distDir = path.resolve(__dirname, '../../dist/src');
const webUiDistDir = path.join(distDir, 'web-ui');

// Compile web-ui TypeScript with its own tsconfig
console.log('Compiling web-ui TypeScript...');
try {
  execSync('npx tsc -p tsconfig.json', { cwd: __dirname, stdio: 'inherit' });
} catch (e) {
  console.error('TypeScript compilation failed');
  process.exit(1);
}

// Read compiled JS and other files
const template = fs.readFileSync(path.join(__dirname, 'web-ui-template.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'web-ui.css'), 'utf8');
let js = fs.readFileSync(path.join(webUiDistDir, 'web-ui-all.js'), 'utf8');

// Strip the empty export that was added for TypeScript module detection
js = js.replace(/^export\s*\{\s*\}\s*;?\s*$/gm, '');

// Assemble final HTML
const html = template
  .replace('/* CSS_PLACEHOLDER */', css)
  .replace('/* JS_PLACEHOLDER */', js);

// Output to dist for runtime
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'web-ui.html'), html);
console.log('Built: dist/src/web-ui.html');

// Also output to src for tests (they expect src/web-ui.html)
fs.writeFileSync(path.join(srcDir, 'web-ui.html'), html);
console.log('Built: src/web-ui.html');
