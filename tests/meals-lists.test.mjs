// Meals + recipes + lists/shopping slice. Acceptance flow: plan Tuesday dinner from a recipe with 4 emojis + photo,
// repeat Tue/Thu, push ingredients to the Shopping list, check items off in the Lists tab, sort alphabetically.
// SCREENSHOT_DIR=<dir> saves demo screenshots.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { loginBrowserContext, loginCookie } from './helpers/auth.mjs';

const port = 4391;
const base = `http://127.0.0.1:${port}`;
const shots = process.env.SCREENSHOT_DIR;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123' }, stdio: 'ignore' });
let browser;
try {
  for (let attempt = 0; attempt < 40; attempt++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const cookie = await loginCookie(base);
  const req = (path, opts = {}) => fetch(`${base}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}), Cookie: cookie } });

  // --- API: list rename/delete, per-list move, per-list clear-completed, unique ids after delete ---
  await req('/api/lists', { method: 'POST', body: JSON.stringify({ name: 'Packliste' }) });
  const a = await (await req('/api/lists/items', { method: 'POST', body: JSON.stringify({ title: 'Zelt', listName: 'Packliste' }) })).json();
  const other = await (await req('/api/lists/items', { method: 'POST', body: JSON.stringify({ title: 'Anderes', listName: 'Ideen' }) })).json();
  const b = await (await req('/api/lists/items', { method: 'POST', body: JSON.stringify({ title: 'Schlafsack', listName: 'Packliste' }) })).json();
  await req(`/api/lists/items/${b.id}/move`, { method: 'POST', body: JSON.stringify({ direction: 'up' }) });
  const packed = (await (await req('/api/lists/items?list=Packliste')).json()).reverse().map(item => item.title);
  assert.deepEqual(packed, ['Schlafsack', 'Zelt'], 'move swaps with the neighbour in the same list, skipping other lists');
  await req(`/api/lists/items/${a.id}/check`, { method: 'POST' }); await req(`/api/lists/items/${other.id}/check`, { method: 'POST' });
  const cleared = await (await req('/api/lists/items/clear-completed?list=Packliste', { method: 'POST' })).json();
  assert.deepEqual(cleared.cleared, [a.id], 'clear-completed is scoped to one list');
  assert.equal((await (await req('/api/lists/items?list=Ideen')).json()).length, 1);
  await req('/api/lists/items/restore-cleared', { method: 'POST' });
  assert.equal((await req('/api/lists/Packliste', { method: 'PUT', body: JSON.stringify({ name: 'Urlaub' }) })).status, 200);
  assert.equal((await (await req('/api/lists/items?list=Urlaub')).json()).length, 2);
  assert.equal((await req('/api/lists/Urlaub', { method: 'PUT', body: JSON.stringify({ name: 'Ideen' }) })).status, 409);
  assert.equal((await req('/api/lists/Ideen', { method: 'DELETE' })).status, 200);
  const fresh = await (await req('/api/lists/items', { method: 'POST', body: JSON.stringify({ title: 'Neu', listName: 'Urlaub' }) })).json();
  const ids = (await (await req('/api/lists/items?limit=200')).json()).map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, `list item ids stay unique after deletes (${fresh.id})`);
  assert.equal((await req('/api/lists/Urlaub', { method: 'DELETE' })).status, 200);
  assert.equal((await (await req('/api/lists')).json()).some(list => list.name === 'Urlaub'), false);
  console.log('meals-lists: list API (rename, delete, scoped move/clear, unique ids) passed');

  // --- Browser acceptance flow ---
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  await loginBrowserContext(context, base);
  const page = await context.newPage();
  page.on('pageerror', error => { throw new Error(`Uncaught page error: ${error.message}`); });
  page.on('dialog', dialog => dialog.accept());
  const live = re => page.waitForFunction(source => new RegExp(source).test(document.querySelector('#live-region')?.textContent ?? ''), re.source);
  await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  try { await page.locator('[data-wizard-skip-all]').waitFor({ timeout: 2000 }); await page.locator('[data-wizard-skip-all]').click(); } catch {}
  await page.evaluate(() => { localStorage.setItem('jd-language', 'en'); });
  await page.waitForFunction(() => window.jdMeals && window.jdListsPlus);

  await page.locator('.tabs a[href="#meals"]').click();
  await page.locator('.mp-week').waitFor();
  const tuesday = page.locator('.mp-day').nth(1);
  const tueDate = await tuesday.getAttribute('data-date');
  const thuDate = await page.locator('.mp-day').nth(3).getAttribute('data-date');
  await tuesday.locator('.mp-slot.mp-dinner').click();
  await page.locator('.mp-dialog .mp-new-recipe').click();
  await page.locator('.mp-recipe-form input[name="name"]').fill('Spaghetti Pomodoro');
  for (const emoji of ['🍝', '🍅', '🧀', '🌶️', '🥦']) await page.locator(`.mp-emoji-palette [data-emoji="${emoji}"]`).click();
  assert.equal(await page.locator('.mp-emoji-current .mp-emoji-chip').count(), 4, 'at most 4 emojis');
  // Large noisy PNG -> must be downscaled to a JPEG data URL <= 200 KB.
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1800; const g = c.getContext('2d'); const img = g.createImageData(c.width, c.height); for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = 120 + Math.random() * 80; img.data[i + 2] = 60; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('.mp-photo-input').setInputFiles({ name: 'pasta.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('.mp-photo-preview img').waitFor();
  await page.locator('.mp-recipe-form textarea[name="ingredients"]').fill('200 g Spaghetti\n4 Tomaten\nBasilikum\nParmesan');
  await page.locator('.mp-recipe-form textarea[name="prep"]').fill('Nudeln kochen, Sauce einkochen, mischen.');
  await page.locator('.mp-cat-new').fill('Pasta');
  await page.locator('.mp-cat-create').click();
  await page.locator('.mp-recipe-form button[type="submit"]').click();
  const tueDinner = page.locator(`.mp-slot.filled[data-date="${tueDate}"][data-slot="dinner"]`);
  await tueDinner.waitFor();
  assert.match(await tueDinner.innerText(), /Spaghetti Pomodoro/);
  assert.equal(await tueDinner.locator('img.mp-photo').count(), 1, 'planned slot shows the recipe photo');
  const stored = await page.evaluate(() => window.jdExtras.get('recipes').items.find(item => item.name === 'Spaghetti Pomodoro'));
  assert.equal(stored.emojis.length, 4); assert.ok(stored.photo.startsWith('data:image/jpeg') && stored.photo.length <= 200 * 1024, `photo is a downscaled JPEG <= 200KB (${stored.photo.length})`);
  assert.deepEqual(stored.categories, ['Pasta']);

  // Repeat on Tue + Thu
  await tueDinner.click();
  await page.locator('.mp-repeat-toggle').click();
  for (const box of await page.locator('.mp-repeat-form input[name="day"]').all()) { const value = await box.getAttribute('value'); if (['2', '4'].includes(value) !== await box.isChecked()) await box.click({ force: true }); }
  await page.locator('.mp-repeat-form button[type="submit"]').click();
  await live(/Repeat saved/);
  await page.locator(`.mp-slot.filled[data-date="${thuDate}"][data-slot="dinner"]`).waitFor();
  assert.equal(await page.locator('.mp-slot.filled').count(), 2, 'Tue + Thu dinner planned this week');
  if (shots) await page.screenshot({ path: `${shots}/meals-week.png` });

  // Servings + ingredients to shopping list
  await page.locator(`.mp-slot.filled[data-date="${thuDate}"]`).click();
  await page.locator('.mp-step[data-step="1"]').click(); await page.locator('.mp-step[data-step="1"]').click();
  await page.waitForFunction(() => /400 g Spaghetti/.test(document.querySelector('.mp-recipe-view')?.textContent ?? ''));
  if (shots) await page.screenshot({ path: `${shots}/meals-detail.png` });
  await page.locator('.mp-meal-shop').click();
  await live(/4 ingredients added/);
  await page.locator('.mp-close').click();
  await page.locator('.mp-week-shop').click();
  await live(/^0 ingredients added.*8 already on the list/);
  // Remove only Thursday's occurrence; Tuesday stays
  await page.locator(`.mp-slot.filled[data-date="${thuDate}"]`).click();
  await page.locator('.mp-remove').click();
  await live(/Meal removed/);
  assert.equal(await page.locator('.mp-slot.filled').count(), 1);
  // Recipe box: search + category filter
  await page.locator('.mp-open-recipes').click();
  await page.locator('.mp-search').fill('xyz');
  assert.equal(await page.locator('.mp-recipe-card').count(), 0);
  await page.locator('.mp-search').fill('spag');
  await page.locator('.mp-cat[data-cat="Pasta"]').click();
  assert.equal(await page.locator('.mp-recipe-card').count(), 1);
  if (shots) await page.screenshot({ path: `${shots}/recipe-box.png` });
  await page.locator('.mp-open-plan').click();

  // Lists tab: Shopping list pinned + selected, check off, alphabetical sort
  await page.locator('.tabs a[href="#lists"]').click();
  await page.locator('.lists-plus').waitFor();
  assert.equal(await page.locator('.lp-list-chip').first().getAttribute('data-list'), 'Shopping');
  assert.equal(await page.locator('.lp-list-chip[data-list="Shopping"]').getAttribute('aria-pressed'), 'true');
  const titles = () => page.locator('.module-data .lp-items:not(.lp-done) .lp-item').evaluateAll(els => els.map(el => el.dataset.title));
  assert.deepEqual(await titles(), ['400 g Spaghetti', '8 Tomaten', 'Basilikum', 'Parmesan'], 'ingredients scaled to 4 servings, manual order = insertion order');
  await page.locator('#module-list-input').fill('Äpfel');
  await page.locator('#module-list-input').press('Enter');
  await live(/List item added/);
  // Offline quick-add queues locally (shown as pending) and syncs when back online
  await page.route('**/api/lists/items', route => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await page.locator('#module-list-input').fill('Brot');
  await page.locator('#module-list-input').press('Enter');
  await live(/List item saved locally; sync pending/);
  await page.locator('.lp-item.pending', { hasText: 'Brot' }).waitFor();
  await page.unroute('**/api/lists/items');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.locator('.lp-item:not(.pending)', { hasText: 'Brot' }).waitFor();
  assert.equal(await page.locator('.lp-item', { hasText: 'Brot' }).count(), 1, 'synced exactly once (no duplicate from two queues)');
  await page.locator('.module-data li', { hasText: 'Brot' }).locator('.lp-more').click();
  await page.locator('.module-data li', { hasText: 'Brot' }).getByRole('button', { name: /Delete/ }).click();
  await live(/List item deleted/);
  await page.locator('.lp-sort [data-sort="alpha"]').click();
  await page.waitForFunction(() => document.querySelector('.lp-sort [data-sort="alpha"]')?.getAttribute('aria-pressed') === 'true');
  await page.waitForFunction(() => document.querySelector('.module-data .lp-items .lp-item')?.dataset.title === '400 g Spaghetti');
  assert.deepEqual(await titles(), ['400 g Spaghetti', '8 Tomaten', 'Äpfel', 'Basilikum', 'Parmesan'].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' })));
  await page.locator('.module-data li', { hasText: 'Basilikum' }).getByRole('button', { name: /Check/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.lp-done .lp-item')].some(el => el.dataset.title === 'Basilikum'));
  assert.equal((await titles()).includes('Basilikum'), false, 'checked items move to the completed section at the bottom');
  if (shots) await page.screenshot({ path: `${shots}/shopping-list.png` });
  assert.equal(await page.evaluate(() => window.jdExtras.get('listMeta').Shopping.sort), 'alpha');
  await page.locator('.lp-clear').click();
  await live(/Completed list items cleared/);
  await page.locator('.lp-undo').click();
  await live(/Completed list items restored/);
  await page.locator('.lp-done .lp-item[data-title="Basilikum"]').waitFor();

  // New list with emoji, rename, delete
  page.removeAllListeners('dialog');
  let answers = ['Baumarkt'];
  page.on('dialog', dialog => dialog.accept(answers.shift() ?? ''));
  await page.locator('.new-list').click();
  await page.locator('.lp-list-chip[data-list="Baumarkt"][aria-pressed="true"]').waitFor();
  await page.locator('.lp-emoji-btn').click();
  await page.locator('.lp-emoji-palette [data-emoji="🛠️"]').click();
  await page.waitForFunction(() => document.querySelector('.lp-list-chip[data-list="Baumarkt"] .lp-emoji')?.textContent === '🛠️');
  answers = ['Werkzeug'];
  await page.locator('.lp-rename').click();
  await page.locator('.lp-list-chip[data-list="Werkzeug"] .lp-emoji', { hasText: '🛠️' }).waitFor();
  answers = [''];
  await page.locator('.lp-delete').click();
  await page.locator('.lp-list-chip[data-list="Shopping"][aria-pressed="true"]').waitFor();
  assert.equal(await page.locator('.lp-list-chip[data-list="Werkzeug"]').count(), 0);

  // Persistence across reload
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.jdMeals && window.jdExtras?.get('mealPlan'));
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.lp-today').count(), 0, 'the Today page has no shopping list card (it lives in the Lists tab)');
  await page.locator('.tabs a[href="#meals"]').click();
  await page.locator(`.mp-slot.filled[data-date="${tueDate}"][data-slot="dinner"]`).waitFor();
  assert.equal(await page.locator(`.mp-slot.filled[data-date="${thuDate}"]`).count(), 0, 'removed occurrence stays removed after reload');
  await page.locator('.mp-next').click();
  assert.equal(await page.locator('.mp-slot.filled').count(), 2, 'repeat continues next week (Tue + Thu)');

  // Mobile layout: panel never clips, no page overflow
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await loginBrowserContext(mobile, base);
  const phone = await mobile.newPage();
  await phone.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  try { await phone.locator('[data-wizard-skip-all]').waitFor({ timeout: 2000 }); await phone.locator('[data-wizard-skip-all]').click(); } catch {}
  await phone.waitForFunction(() => window.jdMeals && window.jdListsPlus);
  await phone.locator('.tabs a[href="#lists"]').click();
  await phone.locator('.lists-plus .lp-item').first().waitFor();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 2, 'lists: no horizontal overflow on phone');
  const checkSize = await phone.locator('.lists-plus .lp-check').first().boundingBox();
  assert.ok(checkSize.width >= 44 && checkSize.height >= 44, 'check targets are at least 44px');
  if (shots) await phone.screenshot({ path: `${shots}/shopping-phone.png` });
  await phone.locator('.tabs a[href="#more"]').click();
  await phone.evaluate(() => document.querySelector('[data-tool="Meals"]').click());
  await phone.locator('.mp-week').waitFor();
  assert.ok(await phone.evaluate(() => { const card = document.querySelector('.meals-panel'); return card.scrollHeight - card.clientHeight; }) <= 2, 'meals panel does not clip on phone');
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 2, 'meals: no horizontal overflow on phone');
  if (shots) await phone.screenshot({ path: `${shots}/meals-phone.png` });
  console.log('meals-lists: recipe (4 emojis + photo) -> Tue dinner, repeat Tue/Thu, ingredients -> Shopping, check off, A-Z sort, lists CRUD passed');
} finally { await browser?.close(); server.kill(); }
