// node scripts/uat-polish-login-865.mjs before|after — #865 at 375x812 and 200%: sign-in with a wrong password.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const WHEN = process.argv[2] || 'after';
const OUT = 'docs/design/uat/polish-login-865';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })).newPage();
await p.goto(`${APP}/login`); await p.waitForTimeout(1000);
await p.getByLabel('Email').fill('admin@example.com'); await p.getByLabel('Password').fill('not-the-password'); await p.getByLabel('Password').press('Enter');
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/wrong-password-${WHEN}.png` });
await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/wrong-password-${WHEN}-200.png` });
await b.close();
