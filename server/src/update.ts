/**
 * "A new version is ready" (#907), for self-hosted installs only: hosted
 * centres, trials and the demo are updated by the host on every merge (#909).
 * The server asks GitHub; the Settings screen only shows the answer.
 */
import { readFileSync } from 'node:fs';
import { DEMO } from './demo.js';
import { TRIAL } from './trial.js';

export const RUNNING = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;
export const UPDATE_LINE = 'cd ~/ayurcalm && git pull && docker compose up -d --build';
const HOSTED = DEMO || TRIAL || process.env.HOSTED === 'true';
const RELEASES = 'https://api.github.com/repos/jpysh/ayurcalm-scheduler/releases/latest';

/** "v0.10.0" is newer than "0.9.2": compared part by part, as numbers. */
export function isNewer(latest: string, running: string) {
  const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a, b] = [parts(latest), parts(running)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

// Twice a day is plenty, and stays far under GitHub's unauthenticated limit.
let cached: { at: number; latest: string | null } | null = null;
async function latestRelease() {
  if (cached && Date.now() - cached.at < 12 * 60 * 60 * 1000) return cached.latest;
  const latest = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000) })
    .then((r) => (r.ok ? r.json() : null)).then((j) => (typeof j?.tag_name === 'string' ? j.tag_name : null)).catch(() => null);
  cached = { at: Date.now(), latest };
  return latest;
}

/** null when there is nothing to say: hosted, offline, or already up to date. */
export async function updateInfo(latest?: string | null) {
  if (HOSTED) return null;
  const tag = latest === undefined ? await latestRelease() : latest;
  return tag && isNewer(tag, RUNNING) ? { running: RUNNING, latest: tag.replace(/^v/, ''), line: UPDATE_LINE } : null;
}
