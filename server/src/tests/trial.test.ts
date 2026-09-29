// Trial clock (#247): 30 days from real use, then read-only.
import assert from 'node:assert/strict';
import { trialState } from '../trial.js';

const start = new Date('2026-10-01T10:00:00Z');
assert.equal(trialState(null).read_only, false);
assert.equal(trialState(start, Date.parse('2026-10-31T09:59:00Z')).read_only, false);
assert.equal(trialState(start, Date.parse('2026-10-31T10:00:00Z')).read_only, true);
assert.equal(trialState(start).ends_at, '2026-10-31T10:00:00.000Z');
console.log('trial clock ok');
