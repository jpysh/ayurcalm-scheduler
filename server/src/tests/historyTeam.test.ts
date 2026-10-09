/** A treatment's history names the whole team when it has more than one therapist (#622). Pure: no server needed. */
import assert from 'node:assert/strict';
import { describer } from '../history.js';

const staff = ['Chandan', 'Dev', 'Esh', 'Asha'].map((name) => ({ id: name.toLowerCase(), name }));
const describe = describer(staff, [], []);

// A pair loses one and gains another: said as a team, never as 'Chandan to Dev'.
assert.deepEqual(describe({ staff_id: 'chandan', co_staff_ids: ['dev'] }, { staff_id: 'dev', co_staff_ids: ['esh'] }), ['Therapists changed from Chandan and Dev to Dev and Esh']);
// One therapist swapped for another keeps its plain words.
assert.deepEqual(describe({ staff_id: 'chandan', co_staff_ids: [] }, { staff_id: 'asha', co_staff_ids: [] }), ['Therapist changed from Chandan to Asha']);
// The same pair with the lead swapped over is not a change worth a line.
assert.deepEqual(describe({ staff_id: 'chandan', co_staff_ids: ['dev'] }, { staff_id: 'dev', co_staff_ids: ['chandan'] }), []);
// A write that does not touch the team says nothing about it.
assert.deepEqual(describe({ staff_id: 'chandan', co_staff_ids: ['dev'], start_time: '10:00' }, { start_time: '11:00' }), ['Start time changed from 10:00 to 11:00']);
console.log('history: a pair that changed members says so as a team');
