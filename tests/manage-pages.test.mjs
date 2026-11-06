// Manage screen: lean tile grid and its sub-pages (Frames, Timetables, Connect calendar, Recommend Dulli).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext, loginCookie } from './helpers/auth.mjs';

const port = Number(process.env.MANAGE_PAGES_PORT ?? 4494); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const cookie = await loginCookie(base);
const api = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { ...(init.headers ?? {}), Cookie: cookie, 'Content-Type': 'application/json' } });
await api('/api/household/demo/members', { method: 'POST', body: JSON.stringify({ name: 'Mira', role: 'child' }) });
await api('/api/household/demo/members', { method: 'POST', body: JSON.stringify({ name: 'Theo', role: 'child' }) });
for (const [child, title] of [['Mira', 'Mathe'], ['Mira', 'Deutsch'], ['Theo', 'Sport']]) await api('/api/school', { method: 'POST', body: JSON.stringify({ child, weekday: 'Monday', title, startsAt: '08:00', room: '1', recurring: true }) });
// Mira: 3-day streak (daily task done today and the two days before) -> bronze frame unlocked
const task = await (await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Zaehne putzen', owner: 'Mira', recurrence: 'daily' }) })).json();
const day = offset => { const d = new Date(); d.setDate(d.getDate() - offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
await api('/api/extras/recipes', { method: 'PUT', body: JSON.stringify({ categories: [], items: [{ id: 'r1', name: 'Pasta', emojis: ['🍝'], servings: 2, ingredients: '200 g Spaghetti', prep: '', categories: [] }, { id: 'r2', name: 'Suppe', emojis: ['🍲'], servings: 4, ingredients: '1 Zwiebel', prep: '', categories: [] }] }) });
await api('/api/extras/taskMeta', { method: 'PUT', body: JSON.stringify({ tasks: {}, completions: { [task.id]: { [day(0)]: true, [day(1)]: true, [day(2)]: true } } }) });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US' });
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'en'); });
  await loginBrowserContext(context, base);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  await page.goto(`${base}/app`);
  await page.waitForFunction(() => window.jdHub && window.jdProfiles && window.jdTasks?.streakOf);
  const openMore = () => page.evaluate(() => document.querySelector('.tabs a[href="#more"]').click());
  await openMore();

  // lean tile grid: no profile strip, no dead tiles, Rewards/Meals tiles hidden, four new tiles
  await page.locator('.jd-tile[data-jd-proxy="frames"]').waitFor();
  assert.equal(await page.locator('.jd-more-profiles').count(), 0, 'profile strip is gone');
  const tiles = await page.locator('.tool-grid .jd-tile:visible').allInnerTexts();
  const text = tiles.join('|');
  for (const wanted of ['Family', 'Frames', 'Meals', 'Timetables', 'Connect calendar', 'Recommend Dulli', 'Settings']) assert.ok(text.includes(wanted), `tile ${wanted} present: ${text}`);
  for (const gone of ['Shared display', 'Smart capture', 'Treasures']) assert.ok(!text.includes(gone), `tile ${gone} removed: ${text}`);
  assert.equal(await page.locator('[data-provider-grid]').first().isVisible(), false, 'calendar connections are not shown permanently under the tiles');

  // Frames page
  await page.locator('.jd-tile[data-jd-proxy="frames"]').click();
  const frames = page.locator('.hub-panel[data-hub="frames"]'); await frames.waitFor({ state: 'visible' });
  assert.ok((await frames.innerText()).includes('How frames work'), 'frames are explained');
  // framed avatars must not pick up the full-screen photo-frame overlay styles
  const positions = await page.evaluate(() => [...document.querySelectorAll('.hub-ladder .jd-avatar, .hub-card .jd-avatar')].map(el => getComputedStyle(el).position));
  assert.ok(positions.length >= 4 && positions.every(position => position !== 'fixed'), 'frame samples are normal avatars: ' + positions.join());
  await page.setViewportSize({ width: 1280, height: 420 }); // short screen: the page must scroll inside to reach every profile
  const scrolls = await frames.evaluate(el => ({ overflow: getComputedStyle(el).overflowY, scrollable: el.scrollHeight > el.clientHeight }));
  assert.ok(['auto', 'scroll'].includes(scrolls.overflow) && scrolls.scrollable, 'frames page scrolls: ' + JSON.stringify(scrolls));
  // scroll to the bottom and check the last card is inside the screen (the page may re-render meanwhile, so poll instead of holding an element)
  await page.waitForFunction(() => { const panel = document.querySelector('.hub-panel[data-hub="frames"]'); panel.scrollTop = panel.scrollHeight; const card = [...panel.querySelectorAll('.hub-card')].at(-1); const box = card.getBoundingClientRect(); return box.bottom <= innerHeight + 1; });
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await frames.locator('[data-hub-frame="silver"][data-member="Mira"]').isDisabled(), true, 'silver needs 7 days');
  await frames.locator('[data-hub-frame="bronze"][data-member="Mira"]').click();
  await page.waitForFunction(() => document.querySelector('.topbar .avatar-chip[title="Mira"]')?.classList.contains('jd-ring-bronze'));
  await frames.locator('[data-hub-frame=""][data-member="Mira"]').click();
  await page.waitForFunction(() => !document.querySelector('.topbar .avatar-chip[title="Mira"]')?.classList.contains('jd-ring-bronze'));
  await frames.locator('[data-hub-back]').click();
  await page.locator('.tool-grid').waitFor({ state: 'visible' });

  // the profile dialog no longer offers frames
  await page.locator('.tool-grid [data-tool="Family"]').click();
  await page.locator('.jd-profile-list li[data-profile="Mira"] [data-profile-edit]').click();
  const dialog = page.locator('dialog.jd-profile-dialog[open]'); await dialog.waitFor();
  assert.equal(await dialog.locator('[data-frame]').count(), 0, 'frames moved out of the profile dialog');
  await page.keyboard.press('Escape');

  // Timetables page: delete one child's timetable, the other one stays
  await openMore(); await page.locator('.jd-tile[data-jd-proxy="school"]').click();
  const school = page.locator('.hub-panel[data-hub="school"]'); await school.waitFor({ state: 'visible' });
  await school.locator('[data-school-clear="Mira"]').click();
  await page.waitForFunction(async () => !(await (await fetch('/api/school')).json()).some(entry => entry.child === 'Mira'));
  const left = await (await api('/api/school')).json(); assert.deepEqual(left.map(entry => entry.child), ['Theo']);
  await school.locator('[data-school-clear="Theo"]').waitFor();

  // Connect calendar page holds the provider cards
  await openMore(); await page.locator('.jd-tile[data-jd-proxy="connect"]').click();
  const connect = page.locator('.hub-panel[data-hub="connect"]'); await connect.waitFor({ state: 'visible' });
  await connect.locator('.provider-card').first().waitFor();
  assert.ok(await connect.locator('.provider-card').count() >= 3, 'Google, CalDAV and ICS cards');

  // Meal settings page: meals, week start, default servings, recipe management
  await openMore(); await page.locator('.jd-tile[data-jd-proxy="meals"]').click();
  const meals = page.locator('.hub-panel[data-hub="meals"]'); await meals.waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1280, height: 420 }); // short screen: the meal settings page scrolls inside
  const mealScroll = await meals.evaluate(el => ({ overflow: getComputedStyle(el).overflowY, scrollable: el.scrollHeight > el.clientHeight }));
  assert.ok(['auto', 'scroll'].includes(mealScroll.overflow) && mealScroll.scrollable, 'meal settings page scrolls: ' + JSON.stringify(mealScroll));
  // scroll to the bottom and check the last card is inside the screen (the page may re-render meanwhile, so poll instead of holding an element)
  await page.waitForFunction(() => { const panel = document.querySelector('.hub-panel[data-hub="meals"]'); panel.scrollTop = panel.scrollHeight; const card = [...panel.querySelectorAll('.hub-card')].at(-1); const box = card.getBoundingClientRect(); return box.bottom <= innerHeight + 1; });
  await page.setViewportSize({ width: 1280, height: 900 });
  await meals.locator('[data-meal-slot="lunch"]').uncheck();
  await meals.locator('[data-meal-weekstart]').selectOption('0');
  await meals.locator('[data-meal-servings]').selectOption('4');
  await page.waitForFunction(async () => { const s = (await (await fetch('/api/extras')).json()).mealSettings; return s && s.weekStart === 0 && s.servings === 4 && s.slots.lunch === false; });
  await meals.locator('[data-meal-slot="breakfast"]').uncheck();
  await page.waitForFunction(() => document.querySelector('[data-meal-slot="dinner"]')?.disabled === true); // the last remaining meal cannot be switched off
  await meals.locator('[data-meal-slot="breakfast"]').check();
  await meals.locator('[data-hub-back]').click();
  await page.evaluate(() => document.querySelector('[data-tool="Meals"]').click());
  await page.locator('.mp-week').waitFor();
  assert.equal(await page.locator('.mp-day').first().locator('.mp-slot').count(), 2, 'lunch is switched off: two meals per day');
  const firstDate = await page.locator('.mp-day').first().getAttribute('data-date');
  assert.equal(new Date(firstDate + 'T12:00:00').getDay(), 0, 'the week starts on Sunday');
  await page.locator('.mp-day').first().locator('.mp-slot.mp-dinner').click();
  await page.locator('.mp-quick input[name="title"]').fill('Reste');
  await page.locator('.mp-quick button[type="submit"]').click();
  await page.waitForFunction(async () => ((await (await fetch('/api/extras')).json()).mealPlan?.entries ?? []).some(entry => entry.title === 'Reste' && entry.servings === 4));
  await openMore(); await page.locator('.jd-tile[data-jd-proxy="meals"]').click();
  await meals.locator('[data-recipe="r1"] [data-recipe-delete]').click();
  await page.waitForFunction(async () => ((await (await fetch('/api/extras')).json()).recipes?.items ?? []).every(item => item.id !== 'r1'));
  assert.equal(await meals.locator('[data-recipe="r1"]').count(), 0, 'deleted recipe is gone from the list');
  assert.equal(await meals.locator('[data-recipe="r2"]').count(), 1, 'other recipes stay');

  // Recommend page
  await openMore(); await page.locator('.jd-tile[data-jd-proxy="share"]').click();
  const share = page.locator('.hub-panel[data-hub="share"]'); await share.waitFor({ state: 'visible' });
  for (const href of ['wa.me', 'facebook.com/sharer', 'twitter.com/intent', 'linkedin.com/sharing']) assert.ok(await share.locator(`a[href*="${href}"]`).count(), `share link ${href}`);
  assert.equal(await share.locator('[data-share-instagram]').count(), 1);
  console.log('manage pages: lean tiles, frames, timetables, calendar connections and sharing passed');
} finally { await browser.close(); server.kill(); }
