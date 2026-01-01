import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const gutexPath = join(__dirname, '..', 'src', 'gutex.js');

describe('Runtime Entry Point Tests', () => {
  
  it('CLI entry point responds to invalid args', (t, done) => {
    const child = spawn('node', [gutexPath]);
    
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill();
        done(new Error('Process did not exit within timeout'));
      }
    }, 2000);
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      assert.strictEqual(code, 1, 'Should exit with code 1 for invalid args');
      assert.ok(stderr.includes('Usage'), 
        'Should show usage message for invalid args');
      done();
    });
  });

  it('CLI entry point starts with valid args (then times out)', (t, done) => {
    // This test verifies the program starts but we can't test full interaction
    // without network and without actual keyboard input
    const child = spawn('node', [gutexPath, '996', '7', '36']);
    
    let stdout = '';
    let hasOutput = false;
    
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      hasOutput = true;
    });
    
    // Give it time to start and show loading message
    setTimeout(() => {
      if (hasOutput) {
        assert.ok(stdout.length > 0, 'Should produce output when starting');
        child.kill();
        done();
      } else {
        // If no output after 3 seconds, that's the silent exit bug
        child.kill();
        done(new Error('Program started but produced no output (silent exit bug)'));
      }
    }, 3000);
  });

  it('CLI validates book ID is a number', (t, done) => {
    const child = spawn('node', [gutexPath, 'abc', '7', '36']);
    
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill();
        done(new Error('Validation did not exit within timeout'));
      }
    }, 2000);
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      assert.strictEqual(code, 1, 'Should exit with error for non-numeric book ID');
      assert.ok(stderr.includes('must be a number'),
        'Should indicate Book ID must be a number');
      done();
    });
  });

  it('CLI validates percent is in range 0-100', (t, done) => {
    const child = spawn('node', [gutexPath, '996', '7', '150']);
    
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill();
        done(new Error('Validation did not exit within timeout'));
      }
    }, 2000);
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      assert.strictEqual(code, 1, 'Should exit with error for invalid percent');
      assert.ok(stderr.includes('between 0 and 100'),
        'Should indicate percent must be 0-100');
      done();
    });
  });

  it('CLI validates chunk size is positive', (t, done) => {
    const child = spawn('node', [gutexPath, '996', '0', '36']);
    
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill();
        done(new Error('Validation did not exit within timeout'));
      }
    }, 2000);
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      assert.strictEqual(code, 1, 'Should exit with error for zero chunk size');
      assert.ok(stderr.includes('at least 1'),
        'Should indicate chunk size must be at least 1');
      done();
    });
  });
});
