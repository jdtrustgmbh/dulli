// Tasks / coins / treasures slice smoke: profile tasks with emoji + category, per-day completion with coins,
// Today block, Bronze chest redeem + undo, persisted via /api/extras.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext } from './helpers/auth.mjs';

const port = Number(process.env.TASKS_SMOKE_PORT ?? 4336);
const base = `http://127.0.0.1:${port}`;
const shots = process.env.TASKS_SMOKE_SHOTS;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), STATE_FILE: '', BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123' }, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await loginBrowserContext(context, base);
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'en'); });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource: .*404/.test(message.text())) errors.push(message.text()); }); // optional /f/<name>.css files may 404 by design
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  for (const name of ['Mia', 'Ben']) await page.evaluate(async member => { await fetch('/api/household/demo/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: member, role: 'child' }) }); }, name);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.jdOpenTasksBoard && window.jdOpenTreasures && window.jdExtras);

  // 1. Tasks tab: board with per-profile columns
  await page.locator('.tabs a[href="#tasks"]').click();
  await page.waitForSelector('.tasks-board-panel:not([hidden]) .tb-col[data-owner="Mia"]');
  assert.equal(await page.locator('.module-view[data-module="tasks"]').evaluate(el => getComputedStyle(el).display), 'none');

  // 2. Create a task for Mia with emoji + Morning category via the editor
  await page.locator('.tb-col[data-owner="Mia"] [data-tb-add]').click();
  await page.locator('.jd-task-dialog input[name="title"]').fill('Brush teeth');
  await page.locator('.jd-task-dialog [data-emoji="🦷"]').click();
  await page.locator('.jd-task-dialog .jd-seg-morning').click();
  await page.locator('.jd-task-dialog input[name="frequency"][value="daily"]').check({ force: true });
  await page.locator('.jd-task-dialog button[type="submit"]').click();
  const item = page.locator('.tb-col[data-owner="Mia"] .tb-cat-morning .tb-item').filter({ hasText: 'Brush teeth' });
  await item.waitFor();
  assert.match(await item.innerText(), /🦷/);
  // a second (evening, weekly-on-today) task for Ben
  await page.locator('.tb-col[data-owner="Ben"] [data-tb-add]').click();
  await page.locator('.jd-task-dialog input[name="title"]').fill('Feed the cat');
  await page.locator('.jd-task-dialog [data-emoji="🐱"]').click();
  await page.locator('.jd-task-dialog .jd-seg-evening').click();
  await page.locator('.jd-task-dialog input[name="coins"]').fill('2');
  await page.locator('.jd-task-dialog input[name="frequency"][value="days"]').check({ force: true });
  await page.locator('.jd-task-dialog button[type="submit"]').click();
  await page.locator('.tb-col[data-owner="Ben"] .tb-cat-evening .tb-item').filter({ hasText: 'Feed the cat' }).waitFor();
  if (shots) await page.screenshot({ path: `${shots}/tasks-board.png` });

  // 3. Complete: coin +1, gold coin, confetti, ring updates
  await item.locator('.tb-task').click();
  await page.waitForSelector('.tb-col[data-owner="Mia"] .tb-item.done');
  assert.equal(await page.locator('.jd-confetti').count() >= 1, true, 'confetti shown');
  await page.waitForFunction(() => window.jdTasks.balanceOf('Mia') === 1);
  assert.equal(await page.locator('.tb-col[data-owner="Mia"] .tb-item.done .jd-coin.gold').count(), 1);
  if (shots) await page.screenshot({ path: `${shots}/tasks-done.png` });
  // idempotent: un-complete reverses, complete again re-awards exactly once
  await page.locator('.tb-col[data-owner="Mia"] .tb-item.done .tb-task').click();
  await page.waitForFunction(() => window.jdTasks.balanceOf('Mia') === 0);
  await page.locator('.tb-col[data-owner="Mia"] .tb-item .tb-task').first().click();
  await page.waitForFunction(() => window.jdTasks.balanceOf('Mia') === 1);
  // per-day: tomorrow the daily task is open again
  await page.locator('[data-tb-day="1"]').click();
  assert.equal(await page.locator('.tb-col[data-owner="Mia"] .tb-item.done').count(), 0);
  await page.locator('[data-tb-day="0"]').click();
  assert.equal(await page.locator('.tb-col[data-owner="Mia"] .tb-item.done').count(), 1);

  // 4. Edit + delete
  await page.locator('.tb-col[data-owner="Ben"] .tb-edit').first().click();
  await page.locator('.jd-task-dialog input[name="title"]').fill('Feed the cat twice');
  await page.locator('.jd-task-dialog button[type="submit"]').click();
  await page.locator('.tb-col[data-owner="Ben"]').getByText('Feed the cat twice').waitFor();

  // 5. Today block
  await page.locator('.clock-title').click(); // shell: the clock title opens Today (the #today tab is hidden)
  await page.waitForSelector('.jd-today-tasks .jd-today-row');
  assert.match(await page.locator('.jd-today-tasks').innerText(), /Brush teeth[\s\S]*|Feed the cat twice/);
  if (shots) await page.screenshot({ path: `${shots}/today.png` });

  // 6. Treasures: adjust +9 (balance 10), redeem Bronze, undo
  await page.locator('.tabs a[href="#treasures"]').click();
  await page.waitForSelector('.treasures-panel:not([hidden]) .tr-bronze');
  const mia = page.locator('.tr-col[data-member="Mia"]');
  await mia.locator('[data-tr-settings]').click();
  await page.locator('.tr-sheet .tr-adjust-amount').fill('9');
  await page.locator('.tr-sheet [data-tr-adjust="1"]').click();
  await page.waitForFunction(() => window.jdTreasures.balanceOf('Mia') === 10);
  await page.locator('.tr-sheet [data-tr-close]').click();
  await mia.locator('.tr-bronze [data-tr-redeem="bronze"]').click();
  await page.waitForSelector('.jd-chest-overlay .jd-chest-pop');
  if (shots) await page.screenshot({ path: `${shots}/chest-open.png` });
  await page.waitForFunction(() => window.jdTreasures.balanceOf('Mia') === 0);
  await page.locator('.jd-chest-overlay').click();
  assert.equal(await page.locator('.jd-chest-overlay').count(), 0, 'overlay closes on tap');
  assert.equal(await mia.locator('.tr-bronze [data-tr-redeem]').isDisabled(), true);
  await mia.locator('[data-tr-history]').click();
  await page.locator('.tr-sheet [data-tr-undo]').first().click();
  await page.waitForFunction(() => window.jdTreasures.balanceOf('Mia') === 10);
  await page.locator('.tr-sheet [data-tr-close]').click();
  // custom one-time treasure
  await mia.locator('[data-tr-settings]').click();
  await page.locator('.tr-sheet .tr-add summary').click();
  await page.locator('.tr-custom-form input[name="name"]').fill('Pick the movie');
  await page.locator('.tr-custom-form input[name="price"]').fill('4');
  await page.locator('.tr-custom-form input[name="repeatable"]').uncheck();
  await page.locator('.tr-custom-form button[type="submit"]').click();
  await page.locator('.tr-sheet').getByText('Pick the movie').waitFor();
  await page.locator('.tr-sheet [data-tr-close]').click();
  const custom = mia.locator('.tr-custom').filter({ hasText: 'Pick the movie' });
  await custom.locator('[data-tr-redeem]').click();
  await page.waitForFunction(() => window.jdTreasures.balanceOf('Mia') === 6);
  await page.locator('.jd-chest-overlay').click().catch(() => {});
  assert.equal(await custom.locator('[data-tr-redeem]').isDisabled(), true, 'one-time treasure locked after redeem');
  if (shots) await page.screenshot({ path: `${shots}/treasures.png` });

  // 7. Persisted server-side
  const extras = await page.evaluate(async () => (await fetch('/api/extras')).json());
  const sum = member => extras.coins.filter(entry => entry.member === member).reduce((total, entry) => total + entry.delta, 0);
  assert.equal(sum('Mia'), 6);
  assert.equal(extras.treasures.history.filter(entry => entry.undoneAt).length, 1);
  assert.equal(Object.values(extras.taskMeta.tasks).some(meta => meta.emoji === '🦷' && meta.category === 'morning'), true);
  // legacy rewards endpoint still answers
  assert.equal(await page.evaluate(async () => (await fetch('/api/rewards')).ok), true);
  assert.deepEqual(errors, []);
  console.log('tasks: board, emoji/category, per-day completion, coins, today block, chests, undo passed');
} finally {
  await browser?.close();
  server.kill();
}
