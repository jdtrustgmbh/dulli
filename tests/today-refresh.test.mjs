// The Today list must follow the real date even when the page stays open overnight (home-screen app, wall display).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = Number(process.env.TODAY_REFRESH_PORT ?? 4475); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await loginBrowserContext(context, base);
  const at = (day, hour) => new Date(`2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+01:00`).toISOString();
  for (const [title, day, hour] of [['Montag Abend', 9, 18], ['Dienstag Abend', 10, 18]]) await context.request.post(`${base}/api/calendar/events`, { data: { title, startsAt: at(day, hour), owner: 'Shared' } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-11-09T14:00:00+01:00') });
  await page.goto(`${base}/app`); await page.waitForSelector('.timeline', { state: 'attached' });
  await page.evaluate(() => document.querySelector('#wizard-dialog')?.close());
  const titles = () => page.evaluate(() => [...document.querySelectorAll('.timeline .timeline-item strong')].map(element => element.textContent));
  await page.waitForFunction(() => document.querySelector('.timeline .timeline-item'));
  assert.deepEqual(await titles(), ['Montag Abend']);
  // overnight: the page stays open, the day changes, the app comes back to the foreground
  await page.clock.fastForward('20:00:00');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => document.querySelector('.timeline .timeline-item strong')?.textContent === 'Dienstag Abend');
  assert.deepEqual(await titles(), ['Dienstag Abend'], 'the next day shows its own events, not yesterday');
  // logo click re-renders as well
  await page.clock.fastForward('24:00:00');
  await page.evaluate(() => document.querySelector('.brand').click());
  await page.waitForFunction(() => !document.querySelector('.timeline .timeline-item strong'));
  console.log('today-refresh: Today list follows the date after overnight and on logo click passed');
} finally { await browser.close(); server.kill(); }
