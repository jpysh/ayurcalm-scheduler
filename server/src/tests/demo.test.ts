// Demo resets (#84) fall on fixed six-hour UTC boundaries.
import assert from 'node:assert/strict';
import { nextReset } from '../demo.js';

const at = (s: string) => nextReset(Date.parse(s)).toISOString();
assert.equal(at('2026-09-29T05:59:00Z'), '2026-09-29T06:00:00.000Z');
assert.equal(at('2026-09-29T06:00:00Z'), '2026-09-29T12:00:00.000Z');
assert.equal(at('2026-09-29T23:10:00Z'), '2026-09-30T00:00:00.000Z');
console.log('demo reset clock ok');
