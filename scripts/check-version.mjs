// Settings says "A new version is ready" whenever the running package.json is
// older than the newest release tag (#1352), so a release that forgets to bump
// the version leaves every install nagging forever. Fails CI when that happens.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).version;
const root = read('../package.json');
const server = read('../server/package.json');
const parse = (v) => v.replace(/^v/, '').split('.').map(Number);
const older = (a, b) => { const [x, y] = [parse(a), parse(b)]; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };

const tags = execSync("git ls-remote --tags --refs origin 'v*'", { encoding: 'utf8' })
  .split('\n').map((l) => l.split('refs/tags/')[1]).filter((t) => /^v\d+\.\d+\.\d+$/.test(t ?? ''));
const newest = tags.reduce((a, b) => (older(a, b) ? b : a), 'v0.0.0');

if (root !== server) throw new Error(`package.json says ${root}, server/package.json says ${server}: bump both.`);
if (older(root, newest)) throw new Error(`package.json says ${root} but release ${newest} exists: bump the version before tagging.`);
console.log(`Version ${root} is not behind the newest release ${newest}.`);
