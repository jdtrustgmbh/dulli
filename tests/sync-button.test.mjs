// The sync button runs a provider sync, spins while it runs and reports the result.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { loginBrowserContext } from './helpers/auth.mjs';

const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:one@test', `DTSTART:${new Date(Date.now() + 86400000).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, 'SUMMARY:Sync test event', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
let delay = 0;
const icsServer = createServer((req, res) => setTimeout(() => { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(ics); }, delay));
await new Promise(resolve => icsServer.listen(0, '127.0.0.1', resolve));
const icsUrl = `http://127.0.0.1:${icsServer.address().port}/cal.ics`;
const port = Number(process.env.SYNC_BUTTON_PORT ?? 4471); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', locale: 'de-DE' });
  await loginBrowserContext(context, base);
  const connected = await context.request.post(`${base}/api/providers/ics/connect`, { data: { url: icsUrl, label: 'Test' } }); assert.equal(connected.status(), 200);
  const page = await context.newPage(); await page.goto(`${base}/app`);
  await page.waitForTimeout(800); await page.evaluate(() => document.querySelector('#wizard-dialog')?.close());
  await page.locator('.tabs-sync').waitFor();
  await page.waitForTimeout(2200); // let the automatic first sync finish
  delay = 1200; // make the next sync slow enough to observe the spinner
  await page.locator('.tabs-sync').click();
  await page.waitForSelector('.tabs-sync.spin');
  await page.waitForSelector('.jd-toast.show');
  assert.match(await page.locator('.jd-toast').innerText(), /Kalender aktualisiert · 1 Termine/);
  assert.equal(await page.locator('.tabs-sync.spin').count(), 0, 'spinner stops when the sync is done');
  // A click while the automatic background sync is still running must join it, not do nothing.
  delay = 0;
  await context.request.post(`${base}/api/providers/ics/connect`, { data: { url: icsUrl, label: 'Second' } });
  await page.locator('.tabs-sync').click(); await page.waitForSelector('.jd-toast.show');
  assert.match(await page.locator('.jd-toast').innerText(), /Kalender aktualisiert/);
  console.log('sync-button: spinner, provider sync and result toast passed');
} finally { await browser.close(); server.kill(); icsServer.close(); }
