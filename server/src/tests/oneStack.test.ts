/**
 * The local stack is always the project "ayurcalm-scheduler" (#824). Without
 * -p, Docker names the project after the folder, so the same command run from a
 * worktree starts a second stack that fights the first for :8080.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../../', import.meta.url);
const scripts: Record<string, string> = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts;

for (const [name, cmd] of Object.entries(scripts).filter(([n]) => n.startsWith('dev:'))) {
  for (const use of cmd.match(/docker compose(?: -p \S+)?/g) ?? []) {
    assert.equal(use, 'docker compose -p ayurcalm-scheduler', `${name} must name the project: ${cmd}`);
  }
}
assert.match(readFileSync(new URL('scripts/qa.sh', root), 'utf8'), /export COMPOSE_PROJECT_NAME="\$\{COMPOSE_PROJECT_NAME:-ayurcalm-scheduler\}"/, 'qa.sh must name the project');
console.log('one stack: dev scripts and qa name the project ayurcalm-scheduler');
