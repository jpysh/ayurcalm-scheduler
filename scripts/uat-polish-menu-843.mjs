// node scripts/uat-polish-menu-843.mjs — what a screen reader hears for the Menu button (#843).
import { chromium } from '@playwright/test';
const APP = process.env.E2E_BASE_URL || 'http://localhost:8080';
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); }, token);
const p = await ctx.newPage();
await p.goto(APP); await p.waitForTimeout(3000);
const menu = p.getByRole('button', { name: 'Menu', exact: true });
console.log(process.env.SHOT || 'after', JSON.stringify(await menu.evaluate((e) => ({ name: e.getAttribute('aria-label'), description: e.getAttribute('aria-describedby') ? document.getElementById(e.getAttribute('aria-describedby')).textContent : '' }))));
await b.close();
