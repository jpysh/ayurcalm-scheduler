import assert from 'node:assert/strict';
// Set before the import, as a west-of-UTC seed sets it: the header must not read the day before (#723).
process.env.ADMIN_TZ = 'America/New_York';
const { shortenWords, fmtLong } = await import('../pdf/dailySchedulePdf.js');

// One unit per character keeps the arithmetic readable.
const w = (s: string) => s.length;

assert.equal(shortenWords('Nasya 45m', 10, w), 'Nasya 45m');
assert.equal(shortenWords('Dhanyamladhara 60m', 10, w), 'Dhanyaml.. 60m');
assert.equal(shortenWords('09:30 Dhanyamladhara 60m\nKizhi 60m', 8, w), '09:30 Dhanya.. 60m\nKizhi 60m');
for (const word of shortenWords('Thalapothichil Jambira', 6, w).split(/\s/)) assert.ok(word.length <= 6);
assert.equal(fmtLong('2030-08-20'), 'Tuesday, 20 August 2030');
console.log('shortenWords: ok');
