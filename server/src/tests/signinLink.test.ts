// One-time sign-in link (#247): only a signin-purpose token with the right secret reads.
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { readSigninLink } from '../auth.js';

const secret = 'x'.repeat(32);
const good = jwt.sign({ purpose: 'signin', email: 'A@b.in', jti: '1' }, secret, { expiresIn: '30m' });
assert.deepEqual(readSigninLink(good, secret), { email: 'a@b.in', jti: '1' });
assert.equal(readSigninLink(good, 'y'.repeat(32)), null);
assert.equal(readSigninLink(jwt.sign({ id: 'u', email: 'a@b.in', role: 'admin', jti: '1' }, secret), secret), null, 'a session token is not a link');
assert.equal(readSigninLink(jwt.sign({ purpose: 'signin', email: 'a@b.in', jti: '1' }, secret, { expiresIn: -1 }), secret), null);
console.log('sign-in link ok');
process.exit(0);
