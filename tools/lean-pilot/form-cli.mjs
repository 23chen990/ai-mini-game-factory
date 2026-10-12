/* global process, console */
import path from 'node:path';
import { safeRead } from './policy.mjs';
import { analyzeFormSessions } from './form-metrics.mjs';

// Explicit local JSON input only: no photographs, URL fetching or provider calls.
try {
  if (process.argv.length !== 3) throw new Error('Usage: npm run pilot:form -- /path/to/recorded-benchmark.json');
  const file = path.resolve(process.argv[2]);
  const input = JSON.parse((await safeRead(path.dirname(file), path.basename(file))).toString('utf8'));
  console.log(JSON.stringify(analyzeFormSessions(input), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
