// node scripts/uat-1130.mjs — Book warns about the same therapy twice and offers Open the existing one, at 375x812 on a throwaway stack (APP_URL).
import { chromium } from '@playwright/test';
const APP = process.env.APP_URL || 'http://localhost:8090';
const OUT = 'docs/design/uat/2026-10-24-open-existing';
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
await p.goto(`${APP}/`); await p.waitForTimeout(3000);
await p.getByRole('button', { name: 'Book a treatment' }).click(); await p.waitForTimeout(1500);
// The first recently booked resident already has a therapy today: book it again.
const row = p.getByRole('dialog').getByText(/last: .+ today|last: .+ \w{3} \d+ \w{3}/).nth(2);
const name = (await row.innerText()).match(/last: (.+?) \w{3} \d+ \w{3}/)[1];
await row.click(); await p.waitForTimeout(1500);
await p.getByRole('dialog').getByText(name, { exact: true }).first().click();
await p.getByRole('button', { name: 'Open the existing one' }).waitFor();
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/book-twice-375.png` });
await p.getByRole('button', { name: 'Open the existing one' }).click(); await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/opened-375.png` });
await b.close();
