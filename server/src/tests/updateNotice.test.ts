// "A new version is ready" (#907): shown only when GitHub's latest release is newer than what runs.
import assert from 'node:assert/strict';
import { isNewer, updateInfo, RUNNING, UPDATE_LINE } from '../update.js';

assert.equal(isNewer('v0.10.0', '0.9.2'), true, 'compared as numbers, not text');
assert.equal(isNewer('v0.4.0', '0.4.0'), false);
assert.equal(isNewer('v0.3.9', '0.4.0'), false);
assert.equal(await updateInfo(null), null, 'GitHub unreachable says nothing');
assert.equal(await updateInfo(`v${RUNNING}`), null, 'up to date says nothing');
assert.deepEqual(await updateInfo('v99.0.0'), { running: RUNNING, latest: '99.0.0', line: UPDATE_LINE });
console.log('update notice ok');
