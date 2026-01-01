/**
 * Custom test reporter with emoji output
 * Uses ASCII markers that test-runner.js replaces with icons
 */

const markers = {
  pass: '[PASS]',
  fail: '[FAIL]',
  suite: '[SUITE]',
  skip: '[SKIP]',
  todo: '[TODO]',
  info: '[INFO]',
  time: '[TIME]',
};

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

export default async function* reporter(source) {
  let tests = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let todo = 0;
  let suites = 0;
  let startTime = Date.now();

  for await (const event of source) {
    switch (event.type) {
      case 'test:start':
        if (event.data.nesting === 0) {
          startTime = Date.now();
        }
        break;

      case 'test:pass':
        if (event.data.skip) {
          skipped++;
          const indent = '  '.repeat(event.data.nesting + 1);
          const time = event.data.details?.duration_ms;
          const timeStr = time ? ` ${c.dim}(${time.toFixed(3)}ms)${c.reset}` : '';
          yield `${indent}[SKIP] ${event.data.name}${timeStr}\n`;
        } else if (event.data.todo) {
          todo++;
          const indent = '  '.repeat(event.data.nesting + 1);
          yield `${indent}[TODO] ${event.data.name}\n`;
        } else {
          const indent = '  '.repeat(event.data.nesting + 1);
          const time = event.data.details?.duration_ms;
          const timeStr = time ? ` ${c.dim}(${time.toFixed(3)}ms)${c.reset}` : '';
          
          if (event.data.details?.type === 'suite') {
            suites++;
            yield `${indent}[SUITE] ${event.data.name}${timeStr}\n`;
          } else {
            tests++;
            passed++;
            yield `${indent}[PASS] ${event.data.name}${timeStr}\n`;
          }
        }
        break;

      case 'test:fail':
        tests++;
        failed++;
        const indent = '  '.repeat(event.data.nesting + 1);
        const time = event.data.details?.duration_ms;
        const timeStr = time ? ` ${c.dim}(${time.toFixed(3)}ms)${c.reset}` : '';
        yield `${indent}[FAIL] ${c.red}${event.data.name}${c.reset}${timeStr}\n`;
        
        if (event.data.details?.error) {
          const err = event.data.details.error;
          const errIndent = '  '.repeat(event.data.nesting + 2);
          if (err.message) {
            yield `${errIndent}${c.red}${err.message}${c.reset}\n`;
          }
          if (err.expected !== undefined && err.actual !== undefined) {
            yield `${errIndent}${c.dim}expected:${c.reset} ${c.green}${JSON.stringify(err.expected)}${c.reset}\n`;
            yield `${errIndent}${c.dim}actual:${c.reset}   ${c.red}${JSON.stringify(err.actual)}${c.reset}\n`;
          }
        }
        break;

      case 'test:diagnostic':
        break;

      case 'test:stderr':
      case 'test:stdout':
        if (event.data.message) {
          yield event.data.message;
        }
        break;
    }
  }

  const duration = Date.now() - startTime;
  yield '\n';
  yield '[INFO] tests ' + tests + '\n';
  yield '[SUITE] suites ' + suites + '\n';
  yield '[PASS] pass ' + passed + '\n';
  if (failed > 0) {
    yield '[FAIL] fail ' + failed + '\n';
  }
  if (skipped > 0) {
    yield '[SKIP] skipped ' + skipped + '\n';
  }
  if (todo > 0) {
    yield '[TODO] todo ' + todo + '\n';
  }
  yield '[TIME] duration_ms ' + duration + '\n';
}
