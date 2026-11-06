// Timetable: one colour per subject, a small edit button per lesson (edit + delete + colour in one dialog), and the lessons survive a restart.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loginBrowserContext, loginCookie } from './helpers/auth.mjs';
import { serializeBundle, deserializeBundle } from '../server/tenancy.mjs';

const port = Number(process.env.SCHOOL_TIMETABLE_PORT ?? 4495); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const cookie = await loginCookie(base);
const api = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { ...(init.headers ?? {}), Cookie: cookie, 'Content-Type': 'application/json' } });
await api('/api/household/demo/members', { method: 'POST', body: JSON.stringify({ name: 'Mira', role: 'child' }) });
await api('/api/household/demo/members', { method: 'POST', body: JSON.stringify({ name: 'Theo', role: 'child' }) });
for (const [weekday, title, startsAt] of [['Monday', 'Ethik', '07:40'], ['Monday', 'Mathe', '09:30'], ['Tuesday', 'Mathe (Differenzierung)', '07:40'], ['Thursday', 'Biologie', '07:40'], ['Friday', 'Sport', '11:20']]) {
  assert.equal((await api('/api/school', { method: 'POST', body: JSON.stringify({ child: 'Mira', weekday, title, startsAt, room: 'R1 · Abc', recurring: true }) })).status, 201);
}

for (const [weekday, title, startsAt] of [['Monday', 'Kunst', '07:40'], ['Wednesday', 'Musik', '09:30']]) await api('/api/school', { method: 'POST', body: JSON.stringify({ child: 'Theo', weekday, title, startsAt, room: 'K1', recurring: true }) });

// Server: only a #rrggbb colour is kept, unknown fields are not stored, and the lessons survive serialisation (a restart).
const bad = await (await api('/api/school', { method: 'POST', body: JSON.stringify({ child: 'Mira', weekday: 'Friday', title: 'Test', startsAt: '08:00', color: 'red', evil: '<script>' }) })).json();
assert.equal(bad.color, ''); assert.equal(bad.evil, undefined);
await api(`/api/school/${bad.id}`, { method: 'DELETE' });
const source = deserializeBundle('t', {}); source.optionalModules.addSchoolEntry({ child: 'A', title: 'Mathe', startsAt: '08:00', color: '#ABCDEF' });
const restored = deserializeBundle('t', JSON.parse(JSON.stringify(serializeBundle(source)))).optionalModules.school();
assert.equal(restored.length, 1); assert.equal(restored[0].color, '#abcdef');

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US' });
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'en'); });
  await loginBrowserContext(context, base);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('dialog', dialog => dialog.accept().catch(() => {}));
  await page.goto(`${base}/app`);
  await page.waitForFunction(() => window.jdOpenSchool);
  await page.evaluate(() => window.jdOpenSchool());
  await page.locator('.school-day article').first().waitFor();

  // One timetable per child: tabs on top, only the chosen child's lessons below, the choice survives a reload.
  const titles = () => page.evaluate(() => [...document.querySelectorAll('.school-day article b')].map(b => b.textContent).sort());
  assert.deepEqual(await page.locator('.jd-school-tab').allTextContents(), ['Mira', 'Theo']);
  assert.equal(await page.locator('.jd-school-tab[aria-selected=true]').textContent(), 'Mira');
  assert.ok(!(await titles()).includes('Kunst'), "Theo's lessons are not shown with Mira's");
  await page.locator('.jd-school-tab', { hasText: 'Theo' }).click();
  assert.deepEqual(await titles(), ['Kunst', 'Musik']);
  await page.reload(); await page.waitForFunction(() => window.jdOpenSchool); await page.evaluate(() => window.jdOpenSchool());
  await page.locator('.school-day article').first().waitFor();
  assert.deepEqual(await titles(), ['Kunst', 'Musik'], 'chosen child is remembered');
  await page.locator('[data-school-add]').click(); await page.locator('dialog.jd-lesson-dialog[open]').waitFor();
  assert.equal(await page.locator('.jd-lesson-form [name=child]').inputValue(), 'Theo', 'add dialog starts with the shown child');
  await page.locator('.jd-lesson-form [data-close]').click();
  await page.locator('.jd-school-tab', { hasText: 'Mira' }).click();

  // No Edit/Delete buttons in the lesson fields; one small edit button each.
  assert.equal(await page.locator('.school-day .inline-actions, .school-day .module-action').count(), 0);
  assert.equal(await page.locator('.school-day .jd-lesson-edit').count(), 5);
  const box = await page.locator('.school-day .jd-lesson-edit').first().boundingBox(); assert.ok(box.width <= 32 && box.height <= 32, 'edit button is small');

  // One colour per subject: both Mathe lessons share it (the bracket suffix does not matter), other subjects differ.
  const colors = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.school-day article')].map(a => [a.querySelector('b').textContent, a.style.getPropertyValue('--c')])));
  assert.equal(colors.Mathe, colors['Mathe (Differenzierung)']);
  assert.equal(new Set(Object.values(colors)).size, 4, 'four subjects, four colours');

  // Edit dialog: change room and colour, apply the colour to the whole subject.
  await page.locator('.school-day article', { hasText: 'Mathe' }).first().locator('.jd-lesson-edit').click();
  const dialog = page.locator('dialog.jd-lesson-dialog[open]'); await dialog.waitFor();
  await dialog.locator('[name=room]').fill('R999 · Neu');
  await dialog.locator('[name=color]').evaluate(input => { input.value = '#00aa00'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await dialog.locator('button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('dialog.jd-lesson-dialog[open]'));
  const lessons = await (await api('/api/school')).json();
  const mathe = lessons.filter(entry => entry.title.startsWith('Mathe'));
  assert.ok(mathe.every(entry => entry.color === '#00aa00'), 'colour applies to every lesson of the subject');
  assert.ok(mathe.some(entry => entry.room === 'R999 · Neu'), 'room saved');
  assert.equal(lessons.find(entry => entry.title === 'Sport').color, '', 'other subjects keep their default colour');

  // "Default color" resets the lesson to the subject colour.
  await page.locator('.school-day article', { hasText: 'Sport' }).locator('.jd-lesson-edit').click();
  await dialog.waitFor();
  await dialog.locator('[name=color]').evaluate(input => { input.value = '#123456'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await dialog.locator('[name=all]').uncheck();
  await dialog.locator('button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('dialog.jd-lesson-dialog[open]'));
  assert.equal((await (await api('/api/school')).json()).find(entry => entry.title === 'Sport').color, '#123456');
  await page.locator('.school-day article', { hasText: 'Sport' }).locator('.jd-lesson-edit').click();
  await dialog.waitFor(); await dialog.locator('[data-color-default]').click(); await dialog.locator('button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('dialog.jd-lesson-dialog[open]'));
  assert.equal((await (await api('/api/school')).json()).find(entry => entry.title === 'Sport').color, '');

  // The add row is gone; a small "+" button in the header opens the same dialog, which stays open for several lessons.
  assert.equal(await page.locator('.school-form').count(), 0);
  await page.locator('[data-school-add]').click();
  await dialog.waitFor();
  assert.equal(await dialog.locator('[data-delete]').count(), 0, 'no delete button when adding');
  await dialog.locator('[name=child]').selectOption('Mira'); await dialog.locator('[name=weekday]').selectOption('Wednesday');
  await dialog.locator('[name=title]').fill('Chemie'); await dialog.locator('[name=startsAt]').fill('11:20'); await dialog.locator('[name=room]').fill('CHS2 · Ban');
  await dialog.locator('button[type=submit]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.school-day article b')].some(b => b.textContent === 'Chemie'));
  assert.ok(await dialog.evaluate(d => d.open), 'dialog stays open after adding');
  assert.equal(await dialog.locator('[name=title]').inputValue(), '', 'subject cleared for the next lesson');
  assert.equal(await dialog.locator('[name=weekday]').inputValue(), 'Wednesday', 'weekday kept');
  await dialog.locator('[data-close]').click();
  const chemie = (await (await api('/api/school')).json()).find(entry => entry.title === 'Chemie');
  assert.equal(chemie.weekday, 'Wednesday'); assert.equal(chemie.startsAt, '11:20'); assert.equal(chemie.room, 'CHS2 · Ban'); assert.equal(chemie.color, '');

  // Delete from the editor.
  await page.locator('.school-day article', { hasText: 'Ethik' }).locator('.jd-lesson-edit').click();
  await dialog.waitFor(); await dialog.locator('[data-delete]').click();
  await page.waitForFunction(() => !document.querySelector('dialog.jd-lesson-dialog[open]'));
  await page.waitForFunction(() => ![...document.querySelectorAll('.school-day article b')].some(b => b.textContent === 'Ethik'));
  assert.equal((await (await api('/api/school')).json()).some(entry => entry.title === 'Ethik'), false);
  console.log('school timetable: subject colours, edit dialog (change, colour, delete) and persistence passed');
} finally { await browser.close(); server.kill(); }
