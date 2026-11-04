// Header avatars: the badge counts what is due TODAY (down to a check mark when done); tapping a profile opens that person's tasks, except in the calendar.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = Number(process.env.AVATAR_COUNTS_PORT ?? 4481); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'de-DE' });
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'de'); });
  await loginBrowserContext(context, base);
  const post = (path, data) => context.request.post(`${base}${path}`, { data });
  for (const name of ['Mia', 'Paul', 'Lea']) await post('/api/household/demo/members', { name, role: 'child' });
  const today = new Date(); const other = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(today.getDay() + 3) % 7];
  await post('/api/tasks', { title: 'Zaehne putzen', owner: 'Mia', recurrence: 'daily' });
  await post('/api/tasks', { title: 'Klavier', owner: 'Mia', recurrence: 'weekly', recurrenceDays: [other] }); // not due today
  await post('/api/tasks', { title: 'Nur anderer Tag', owner: 'Paul', recurrence: 'weekly', recurrenceDays: [other] }); // Paul has nothing today
  const page = await context.newPage(); await page.goto(`${base}/app`);
  await page.waitForSelector('.topbar .avatar-row .avatar-chip');
  const badge = name => page.evaluate(n => document.querySelector(`.topbar .avatar-chip[title="${n}"] .avatar-count`)?.textContent ?? null, name);
  await page.waitForFunction(() => document.querySelector('.topbar .avatar-chip[title="Mia"] .avatar-count'));
  assert.equal(await badge('Mia'), '1', 'only the task due today is counted (the other-weekday task is not)');
  assert.equal(await badge('Paul'), null, 'a person with nothing due today shows no number');

  // tap in the calendar keeps filtering the calendar instead of leaving it
  await page.evaluate(() => document.querySelector('#wizard-dialog')?.close());
  await page.locator('.tabs a[href="#calendar"]').click(); await page.waitForTimeout(600);
  await page.locator('.topbar .avatar-chip[title="Lea"]').click(); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector('.tabs a.active')?.getAttribute('href')), '#calendar', 'calendar stays open');

  // outside the calendar: jump to that person's tasks
  await page.locator('.clock-title').click(); await page.waitForTimeout(500);
  await page.locator('.topbar .avatar-chip[title="Mia"]').click();
  await page.waitForSelector('.tasks-board-panel:not([hidden])');
  assert.equal(await page.evaluate(() => document.querySelector('.tabs a.active')?.getAttribute('href')), '#tasks');
  assert.equal(await page.evaluate(() => document.querySelector('.tb-fchip[aria-pressed="true"]')?.dataset.tbFilter), 'Mia', 'board is filtered to the tapped person');

  // completing today's task turns the number into a check mark
  await page.evaluate(async () => { const tasks = await (await fetch('/api/tasks?limit=50')).json(); const t = tasks.find(item => item.title === 'Zaehne putzen'); await window.jdTasks.toggle(t.id); });
  await page.waitForFunction(() => document.querySelector('.topbar .avatar-chip[title="Mia"] .avatar-count.done'));
  assert.equal(await badge('Mia'), '✓');
  // the Today card no longer shows the duplicate grey count
  await page.locator('.clock-title').click(); await page.waitForTimeout(500);
  assert.equal(await page.locator('.jd-today-row header small').count(), 0, 'no duplicate done/total text');
  console.log('avatar-counts: today-only badge, check mark, tap opens tasks (not in calendar) passed');
} finally { await browser.close(); server.kill(); }
