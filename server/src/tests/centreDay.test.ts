// "Today" is the centre's day, from Settings.timezone, never the machine's (#732).
// The server runs in UTC: a Sydney morning is still yesterday there and a New York
// evening already tomorrow, so reading the date off `new Date()` is wrong for both.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return f === 'tests' ? [] : files(p);
  return p.endsWith('.ts') ? [p] : [];
});
const machineDay = /new Date\(\)\.(toDateString|getDate|getDay|setHours|toISOString\(\)\.slice\(0, ?10\))/;
const found = files(root).flatMap((p) => readFileSync(p, 'utf8').split('\n')
  .map((line, i) => (machineDay.test(line) ? `${p.slice(root.length + 1)}:${i + 1}` : null))
  .filter((x): x is string => x !== null));
assert.deepEqual(found, [], `the machine's date read as the centre's day; use centreClock(settings.timezone):\n${found.join('\n')}`);
console.log(`ok   nothing reads the machine's date as today (${files(root).length} files)`);
