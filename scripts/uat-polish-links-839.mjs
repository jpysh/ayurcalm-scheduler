// node scripts/uat-polish-links-839.mjs <therapist link token> — a required checklist item's spoken name, and the shot (#839).
// SHOT=before against main, SHOT=after (default) against the branch.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const SHOT = process.env.SHOT || 'after';
const OUT = process.env.OUT || 'docs/design/uat/2026-10-17-polish-links';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
await p.goto(`${APP}/l/${process.argv[2]}`); await p.waitForTimeout(2500);
const box = p.getByRole('checkbox', { name: /required/ }).first();
console.log(SHOT, JSON.stringify(await box.evaluate((e) => (e.closest('label') || e.parentElement).textContent)));
await p.screenshot({ path: `${OUT}/${SHOT}-therapist-link.png` });
await b.close();
