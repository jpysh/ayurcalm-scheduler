// "Printed 5 mornings in a row" counts back from the centre's today (#1305).
import assert from 'node:assert/strict';
import { printStreak } from '../printStreak.js';

assert.equal(printStreak([], '2030-03-10'), 0);
assert.equal(printStreak(['2030-03-10', '2030-03-09', '2030-03-08'], '2030-03-10'), 3);
assert.equal(printStreak(['2030-03-09', '2030-03-08'], '2030-03-10'), 2, 'today not printed yet keeps yesterday\'s run');
assert.equal(printStreak(['2030-03-10', '2030-03-08'], '2030-03-10'), 1, 'a missed day breaks it');
assert.equal(printStreak(['2030-03-01', '2030-02-28'], '2030-03-01'), 2, 'across a month end');
assert.equal(printStreak(['2030-03-11', '2030-03-10'], '2030-03-10'), 1, 'tomorrow printed the evening before does not count yet');
console.log('printStreak: ok');
