/**
 * Residents from a spreadsheet (#741): a CSV from Excel and rows pasted from
 * Google Sheets are read by loose headers, and each row is ready or says what
 * stops it. Pure: no server or database.
 */
import assert from 'node:assert/strict';
import { checkResidentRows, readDate } from '../residentImport.js';

const TODAY = '2030-04-10';

const csv = '﻿Full Name,Sex,Check-in,Check-out,Mobile\r\n'
  + 'Meera Rao,F,10/04/2030,20/04/2030,+91 98100 00001\r\n'
  + '"Shah, Arjun",male,2030-04-12,2030-04-19,\r\n'
  + 'Ida Berg,,11 Apr 2030,18 Apr 2030,\r\n'
  + 'Old Guest,F,01/03/2030,09/04/2030,\r\n'
  + 'Typo Date,M,31/02/2030,05/05/2030,\r\n'
  + 'Backwards,W,20/04/2030,12/04/2030,\r\n'
  + ',,,,\r\n';
const { columns, rows } = checkResidentRows(csv, TODAY);
assert.deepEqual(columns, { name: true, gender: true, arriving: true, leaving: true, phone: true });
assert.equal(rows.length, 6, 'a blank row is skipped, every other row comes back');
assert.deepEqual(rows[0], { line: 2, name: 'Meera Rao', gender: 'female', arriving: '2030-04-10', leaving: '2030-04-20', phone: '+91 98100 00001', problems: [] });
assert.equal(rows[1].name, 'Shah, Arjun', 'a quoted comma stays in the name');
assert.deepEqual(rows[1].problems, []);
assert.deepEqual(rows[2].problems, ['no_gender']);
assert.equal(rows[2].arriving, '2030-04-11');
assert.deepEqual(rows[3].problems, ['leaving_past']);
assert.deepEqual(rows[4].problems, ['bad_date'], '31 February is not a date');
assert.deepEqual(rows[5].problems, ['leaving_before_arriving'], 'the patient rules refuse a stay that ends before it starts');

// Pasted from Google Sheets: tab-separated, no header row.
const pasted = checkResidentRows('Anna Kurz\tWoman\t2030-04-10\t2030-04-14\nRavi\t\t2030-04-10\t2030-04-14', TODAY);
assert.deepEqual(pasted.rows.map((r) => r.problems), [[], ['no_gender']]);
assert.equal(pasted.rows[0].gender, 'female');

// A missing column is reported, so the screen can say which.
assert.equal(checkResidentRows('Name,Arrival,Departure\nX,2030-04-10,2030-04-11', TODAY).columns.gender, false);

assert.equal(readDate('13.10.26'), '2026-10-13');
assert.equal(readDate('tomorrow'), null);
console.log('residentImport: rows from a spreadsheet are read and checked');
