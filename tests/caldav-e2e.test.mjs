// CalDAV through the real server and UI: connect dialog, wrong password message, imported events, sync, and disconnect.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { loginBrowserContext } from './helpers/auth.mjs';

const AUTH = `Basic ${Buffer.from('anna:secret').toString('base64')}`;
const start = new Date(Date.now() + 2 * 86400000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:e1\r\nSUMMARY:CalDAV Zahnarzt\r\nDTSTART:${start}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const dav = createServer(async (req, res) => {
  if (req.headers.authorization !== AUTH) { res.writeHead(401); return res.end(); }
  for await (const chunk of req) void chunk;
  res.writeHead(207, { 'Content-Type': 'application/xml' });
  if (req.method === 'PROPFIND') return res.end('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/cal/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar xmlns:c="urn:ietf:params:xml:ns:caldav"/></d:resourcetype><d:displayname>Familie</d:displayname></d:prop></d:propstat></d:response></d:multistatus>');
  res.end(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/a.ics</d:href><d:propstat><d:prop><c:calendar-data>${ics}</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`);
});
await new Promise(resolve => dav.listen(0, '127.0.0.1', resolve));
const davUrl = `http://127.0.0.1:${dav.address().port}/cal/`;
const port = Number(process.env.CALDAV_E2E_PORT ?? 4472); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), BOOTSTRAP_EMAIL: 'test@example.com', BOOTSTRAP_PASSWORD: 'test-password-123', DATABASE_URL: '', CALDAV_ALLOW_INSECURE_TEST: '1' }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', locale: 'de-DE' });
  await loginBrowserContext(context, base);
  const page = await context.newPage(); await page.goto(`${base}/app`);
  await page.evaluate(() => document.querySelector('#wizard-dialog')?.close());
  const providers = await (await context.request.get(`${base}/api/providers`)).json();
  assert.ok(providers.some(item => item.id === 'caldav') && !providers.some(item => item.id === 'outlook'), 'caldav listed, outlook hidden');

  await page.waitForFunction(() => typeof window.jdConnectCaldav === 'function');
  const result = page.evaluate(() => window.jdConnectCaldav());
  const dialog = page.locator('.jd-caldav-dialog'); await dialog.waitFor();
  await dialog.locator('[name=url]').fill(davUrl); await dialog.locator('[name=username]').fill('anna'); await dialog.locator('[name=password]').fill('wrong');
  await dialog.locator('[type=submit]').click();
  await dialog.locator('.jd-caldav-error:not([hidden])').waitFor();
  assert.match(await dialog.locator('.jd-caldav-error').innerText(), /Anmeldung fehlgeschlagen/);
  await dialog.locator('[name=password]').fill('secret'); await dialog.locator('[type=submit]').click();
  assert.equal(await result, true, 'dialog resolves true after a successful connect');

  const connections = await (await context.request.get(`${base}/api/provider-connections`)).json();
  const connection = connections.find(item => item.provider === 'caldav'); assert.ok(connection, 'connection stored');
  assert.ok(!JSON.stringify(connections).includes('secret'), 'password is never returned to the client');
  const synced = await context.request.post(`${base}/api/providers/connections/${connection.id}/sync`); assert.equal(synced.status(), 200);
  assert.equal((await synced.json()).count, 1);
  const events = await (await context.request.get(`${base}/api/calendar/events`)).json();
  assert.ok(JSON.stringify(events).includes('CalDAV Zahnarzt'), 'event is in the calendar');
  const gone = await context.request.post(`${base}/api/providers/connections/${connection.id}/disconnect`); assert.equal(gone.status(), 200);
  assert.ok(!JSON.stringify(await (await context.request.get(`${base}/api/calendar/events`)).json()).includes('CalDAV Zahnarzt'), 'events removed on disconnect');
  console.log('caldav-e2e-smoke: dialog, wrong password, import, sync, disconnect passed');
} finally { await browser.close(); server.kill(); dav.close(); }
