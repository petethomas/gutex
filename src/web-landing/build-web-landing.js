#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '..');
const distDir = path.resolve(__dirname, '../../dist/src');
const webLandingDistDir = path.join(distDir, 'web-landing');

// Compile web-landing TypeScript modules with its own tsconfig
console.log('Compiling web-landing TypeScript modules...');
try {
  execSync('npx tsc -p tsconfig.json', { cwd: __dirname, stdio: 'inherit' });
} catch (e) {
  console.error('TypeScript compilation failed');
  process.exit(1);
}

// Read and concatenate compiled JS modules in sorted order
const moduleFiles = fs.readdirSync(path.join(webLandingDistDir, 'modules'))
  .filter(f => f.endsWith('.js'))
  .sort(); // Alphabetical sort ensures correct order (01-, 02-, etc.)

console.log(`Found ${moduleFiles.length} modules`);

let js = '';
for (const file of moduleFiles) {
  const content = fs.readFileSync(path.join(webLandingDistDir, 'modules', file), 'utf8');
  js += content + '\n';
}

// Strip any empty exports that TypeScript might add
js = js.replace(/^export\s*\{\s*\}\s*;?\s*$/gm, '');

// Read template and CSS
const template = fs.readFileSync(path.join(__dirname, 'web-landing-template.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'web-landing.css'), 'utf8');

// Assemble final HTML
// Use function replacement to avoid special $& pattern interpretation
const html = template
  .replace('/* CSS_PLACEHOLDER */', () => css)
  .replace('/* JS_PLACEHOLDER */', () => js);

// Output to dist for runtime
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'web-landing.html'), html);
console.log('Built: dist/src/web-landing.html');

// Also output to src for development/testing
fs.writeFileSync(path.join(srcDir, 'web-landing.html'), html);
console.log('Built: src/web-landing.html');
