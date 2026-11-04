// Profile view: events for everyone ("Gemeinsam") span all profile columns (no separate column); a connected calendar can belong to a person.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { loginBrowserContext } from './helpers/auth.mjs';

const stamp = hour => { const d = new Date(); d.setHours(hour, 0, 0, 0); return d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; };
const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:w1\r\nSUMMARY:Pauls Training\r\nDTSTART:${stamp(15)}\r\nDTEND:${stamp(16)}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const icsServer = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(ics); });
await new Promise(resolve => icsServer.listen(0, '127.0.0.1', resolve));
const port = Number(process.env.SHARED_SPAN_PORT ?? 4482); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', STATE_FILE: '' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block', locale: 'de-DE' });
  await context.addInitScript(() => { localStorage.setItem('jd-activated', 'true'); localStorage.setItem('jd-language', 'de'); });
  await loginBrowserContext(context, base);
  const post = (path, data) => context.request.post(`${base}${path}`, { data });
  for (const name of ['Mia', 'Paul']) await post('/api/household/demo/members', { name, role: 'child' });
  const at = hour => { const d = new Date(); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  const end = hour => { const d = new Date(); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  await post('/api/calendar/events', { title: 'Familienessen', startsAt: at(12), endsAt: end(14), owner: 'Shared' });
  await post('/api/calendar/events', { title: 'Mias Arzt', startsAt: at(12), endsAt: end(13), owner: 'Mia', owners: ['Mia'] });
  await post('/api/calendar/events', { title: 'Ferientag', startsAt: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), allDay: true, owner: 'Shared' });
  // a connected calendar: first for everyone, then assigned to Paul
  const connected = await post('/api/providers/ics/connect', { url: `http://127.0.0.1:${icsServer.address().port}/c.ics`, label: 'Verein' }); assert.equal(connected.status(), 200);
  const connection = (await connected.json()).id;
  const events = async () => (await (await context.request.get(`${base}/api/calendar/events`)).json());
  assert.equal((await events()).find(e => e.title === 'Pauls Training').owner, 'Shared', 'default: the calendar belongs to everyone');
  assert.equal((await post(`/api/providers/connections/${connection}/owner`, { owner: 'Nobody' })).status(), 400, 'unknown member rejected');
  assert.equal((await post(`/api/providers/connections/${connection}/owner`, { owner: 'Paul' })).status(), 200);
  const paulEvent = (await events()).find(e => e.title === 'Pauls Training'); assert.deepEqual([paulEvent.owner, paulEvent.owners], ['Paul', ['Paul']], 'events follow the calendar owner at once');

  const page = await context.newPage(); await page.goto(`${base}/app`); await page.waitForSelector('.tabs a[href="#calendar"]');
  await page.evaluate(() => document.querySelector('#wizard-dialog')?.close());
  await page.locator('.tabs a[href="#calendar"]').click();
  await page.locator('.cal-view-btn[data-view="profiles"]').click();
  await page.waitForFunction(() => document.querySelector('.calendar-week-panel')?.dataset.view === 'profiles');
  await page.waitForSelector('.week-shared-layer .week-event');
  assert.equal(await page.locator('.week-day-col').count(), 2, 'one column per profile, no separate Shared column');
  assert.equal(await page.locator('.week-day-col header', { hasText: 'Gemeinsam' }).count(), 0);
  const layer = await page.locator('.week-shared-layer').boundingBox(); const columns = await page.locator('.week-day-body').evaluateAll(list => list.map(el => el.getBoundingClientRect().toJSON()));
  const shared = await page.locator('.week-shared-layer .week-event', { hasText: 'Familienessen' }).boundingBox();
  assert.ok(shared.x <= columns[0].left + 8 && shared.x + shared.width >= columns[1].right - 8, 'the shared event stretches across all profile columns');
  assert.ok(layer.width >= columns[1].right - columns[0].left - 2);
  assert.equal(await page.locator('.week-day-col:nth-of-type(1) .week-event', { hasText: 'Mias Arzt' }).count() + await page.locator('.week-event', { hasText: 'Mias Arzt' }).count() > 0, true, 'personal events stay in their column');
  assert.equal(await page.locator('.week-shared-strip .week-allday-chip', { hasText: 'Ferientag' }).count(), 1, 'all-day shared events sit in a strip above all columns');
  assert.equal(await page.locator('.week-shared-layer .week-event', { hasText: 'Pauls Training' }).count(), 0, 'the calendar assigned to Paul is not shared any more');
  console.log('shared-span: shared events span all profile columns, connected calendar owner passed');
} finally { await browser.close(); server.kill(); icsServer.close(); }
