// node scripts/uat-prelaunch-crawl.mjs — the pre-launch audit's inventory: every screen the Menu reaches, every scroll,
// and every button that only opens something, at 375x812, on a throwaway stack (APP_URL). Saving, deleting and sending are
// left to the scripted walk, so the crawl changes nothing.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const APP = process.env.APP_URL || 'http://localhost:8097';
const OUT = process.env.OUT || 'docs/design/audit/2026-10-22-prelaunch/crawl';
mkdirSync(OUT, { recursive: true });
const SKIP = /save|delete|remove|book|send|sign out|log out|discharge|cancel|confirm|undo|reset|import|export|print|retire|didn.t come|move|fix|apply|plan tomorrow|make it mine|finish|close day|yes|copy link|reissue/i;
const { token } = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'demo1234' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata', acceptDownloads: false });
await ctx.addInitScript((t) => { localStorage.setItem('authToken', t); localStorage.setItem('authRole', 'Admin'); localStorage.setItem('authUser', 'admin@example.com'); }, token);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(`${p.url()} ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error') errors.push(`${p.url()} ${m.text()}`); });
const rows = [['screen', 'element', 'action', 'shot', 'result']];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const settle = () => p.waitForTimeout(900);
const closeAll = async () => { for (let i = 0; i < 4 && (await p.getByRole('dialog').count()); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(350); } };

async function shootScrolls(name) {
  const h = await p.evaluate(() => document.scrollingElement.scrollHeight);
  const n = Math.min(6, Math.ceil(h / 812));
  for (let i = 0; i < n; i++) {
    await p.evaluate((y) => window.scrollTo(0, y), i * 700); await p.waitForTimeout(300);
    const shot = `${name}-scroll${i}.png`; await p.screenshot({ path: `${OUT}/${shot}` });
    rows.push([name, `page ${i + 1}/${n}`, 'scroll', shot, 'ok']);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
}

async function openFromMenu(label) {
  await p.goto(`${APP}/`); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Menu', exact: true }).click(); await settle();
  await p.getByRole('dialog').getByRole('button', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click(); await settle(); await settle();
}

await p.goto(`${APP}/`); await p.waitForTimeout(3500);
await p.getByRole('button', { name: 'Menu', exact: true }).click(); await settle();
const menu = (await p.getByRole('dialog').getByRole('button').allInnerTexts()).map((t) => t.trim().split('\n')[0]).filter((t) => t && !SKIP.test(t) && !/^close$/i.test(t));
await p.screenshot({ path: `${OUT}/menu.png` }); rows.push(['Menu', 'menu', 'open', 'menu.png', menu.join(' | ')]);
await closeAll();
const screens = ['Today', ...menu];

for (const screen of screens) {
  const name = slug(screen);
  try {
    if (screen !== 'Today') await openFromMenu(screen.split('\n')[0]);
    const url = p.url();
    const inDialog = await p.getByRole('dialog').count();
    const scope = inDialog ? p.getByRole('dialog').last() : p.locator('main, body').first();
    await shootScrolls(name);
    const inputs = await scope.locator('input, textarea, select').count();
    rows.push([screen, `${inputs} inputs`, 'count', '', '']);
    const labels = [...new Set((await scope.getByRole('button').allInnerTexts()).map((t) => t.trim().split('\n')[0]).filter((t) => t && !SKIP.test(t) && !/^(menu|close)$/i.test(t)))].slice(0, 30);
    for (const label of labels) {
      try {
        if (screen === 'Today') { await p.goto(`${APP}/`); await p.waitForTimeout(2500); } else await openFromMenu(screen.split('\n')[0]);
        const target = (inDialog ? p.getByRole('dialog').last() : p).getByRole('button', { name: label }).first();
        if (!(await target.isVisible())) await target.scrollIntoViewIfNeeded({ timeout: 3000 });
        const before = await p.getByRole('dialog').count();
        await target.click({ timeout: 4000 }); await settle();
        const shot = `${name}--${slug(label)}.png`; await p.screenshot({ path: `${OUT}/${shot}` });
        const opened = (await p.getByRole('dialog').count()) > before ? 'sheet opened' : p.url() !== url ? `went to ${new URL(p.url()).pathname}` : 'changed in place';
        rows.push([screen, label, 'tap', shot, opened]);
        if ((await p.getByRole('dialog').count()) > before) { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
        if (p.url() !== url) { await p.goto(url); await p.waitForTimeout(2000); }
      } catch (e) { rows.push([screen, label, 'tap', '', `FAILED: ${e.message.split('\n')[0]}`]); await closeAll(); }
    }
  } catch (e) { rows.push([screen, '', 'open', '', `FAILED: ${e.message.split('\n')[0]}`]); }
}
writeFileSync(`${OUT}/inventory.tsv`, rows.map((r) => r.map((c) => String(c).replace(/\s+/g, ' ')).join('\t')).join('\n'));
writeFileSync(`${OUT}/errors.txt`, [...new Set(errors)].join('\n'));
console.log(`${rows.length - 1} rows, ${errors.length} console errors`);
await b.close();
