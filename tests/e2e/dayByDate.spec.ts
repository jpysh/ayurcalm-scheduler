import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** #784: a neighbouring day is taken by date, never as the clock plus or minus 24 hours, which is wrong on a 23- or 25-hour day. */
test('no screen works out yesterday or tomorrow from the clock', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
  const found = files('src').flatMap((p) => readFileSync(p, 'utf8').split('\n')
    .map((line, i) => (/Date\.now\(\) ?[-+] ?(86_?400_?000|DAY)/.test(line) ? `${p}:${i + 1}` : null))
    .filter(Boolean));
  expect(found).toEqual([]);
});
