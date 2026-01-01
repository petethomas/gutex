#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { CliOptions } from './cli-options.js';
import { SnapshotRunner } from './snapshot-runner.js';
import { GutexEnhanced } from './gutex-enhanced.js';

async function main(): Promise<void> {
  const options = new CliOptions();
  
  if (!options.isValid()) {
    console.error(options.getErrorMessage());
    console.error(options.getUsageMessage());
    process.exit(1);
  }
  
  if (options.snapshot) {
    const runner = new SnapshotRunner(options.bookId!, options.chunkSize!, options.startPercent!);
    await runner.run();
    return;
  }
  
  const gutex = new GutexEnhanced(
    options.bookId!,
    options.chunkSize!,
    options.startPercent!,
    { showChrome: !options.raw }
  );
  
  await gutex.run();
}

// Main execution check
const modulePath = fileURLToPath(import.meta.url);
const scriptPath = process.argv[1];

if (scriptPath && (modulePath.endsWith(scriptPath) || scriptPath.endsWith('gutex-core') || scriptPath.endsWith('gutex-core.js'))) {
  main().catch(err => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Fatal error: ${message}\n`);
    if (process.env.DEBUG === '1' && err instanceof Error) {
      console.error(err.stack);
    }
    process.exit(1);
  });
}

export { main };
