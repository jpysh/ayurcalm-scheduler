import assert from 'node:assert/strict';
import { shortenWords } from '../pdf/dailySchedulePdf.js';

// One unit per character keeps the arithmetic readable.
const w = (s: string) => s.length;

assert.equal(shortenWords('Nasya 45m', 10, w), 'Nasya 45m');
assert.equal(shortenWords('Dhanyamladhara 60m', 10, w), 'Dhanyaml.. 60m');
assert.equal(shortenWords('09:30 Dhanyamladhara 60m\nKizhi 60m', 8, w), '09:30 Dhanya.. 60m\nKizhi 60m');
for (const word of shortenWords('Thalapothichil Jambira', 6, w).split(/\s/)) assert.ok(word.length <= 6);
console.log('shortenWords: ok');
