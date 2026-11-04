// CalDAV import against a mock server: .well-known redirect, principal -> home-set -> calendar discovery, task-only collections skipped,
// REPORT with recurrence expansion, wrong password rejected, and direct calendar URLs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

process.env.CALDAV_ALLOW_INSECURE_TEST = '1';
const AUTH = `Basic ${Buffer.from('anna:secret').toString('base64')}`;
const ics = events => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.map(([uid, title, start, extra = '']) => `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${title}\r\nDTSTART:${start}\r\nDTEND:${start.replace(/T(\d\d)/, (m, h) => `T${String(Number(h) + 1).padStart(2, '0')}`)}\r\n${extra}END:VEVENT\r\n`).join('')}END:VCALENDAR`;
const day = offset => { const d = new Date(Date.now() + offset * 86400000); return `${d.toISOString().slice(0, 10).replace(/-/g, '')}T100000Z`; };
const multistatus = body => `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${body}</D:multistatus>`;
const methods = [];
const mock = createServer(async (req, res) => {
  methods.push(`${req.method} ${req.url}`);
  const send = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/xml', ...headers }); res.end(body); };
  if (req.headers.authorization !== AUTH) return send(401, '');
  let body = ''; for await (const chunk of req) body += chunk;
  if (req.url === '/.well-known/caldav') return send(301, '', { Location: '/dav/' });
  if (req.url === '/dav/' && req.method === 'PROPFIND') return send(207, multistatus('<D:response><D:href>/dav/</D:href><D:propstat><D:prop><D:current-user-principal><D:href>/dav/principals/anna/</D:href></D:current-user-principal></D:prop></D:propstat></D:response>'));
  if (req.url === '/dav/principals/anna/' && req.method === 'PROPFIND') return send(207, multistatus('<D:response><D:href>/dav/principals/anna/</D:href><D:propstat><D:prop><C:calendar-home-set><D:href>/dav/cals/</D:href></C:calendar-home-set></D:prop></D:propstat></D:response>'));
  if (req.url === '/dav/cals/' && req.method === 'PROPFIND') {
    const cal = (href, name, comps) => `<D:response><D:href>${href}</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>${name}</D:displayname><C:supported-calendar-component-set>${comps.map(c => `<C:comp name="${c}"/>`).join('')}</C:supported-calendar-component-set></D:prop></D:propstat></D:response>`;
    return send(207, multistatus(`<D:response><D:href>/dav/cals/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>${cal('/dav/cals/home/', 'Familie', ['VEVENT'])}${cal('/dav/cals/work/', 'Arbeit', ['VEVENT'])}${cal('/dav/cals/todo/', 'Aufgaben', ['VTODO'])}`));
  }
  if (req.url.startsWith('/dav/cals/') && req.method === 'PROPFIND') return send(207, multistatus(`<D:response><D:href>${req.url}</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Direkt</D:displayname></D:prop></D:propstat></D:response>`));
  if (req.method === 'REPORT') {
    assert.match(body, /calendar-query/); assert.match(body, /expand/, 'recurrence expansion is requested');
    const home = req.url === '/dav/cals/home/';
    const data = home
      ? ics([['u1', 'Zahnarzt', day(2)], ['u2', 'Turnen', day(3), 'RECURRENCE-ID:x\r\n'], ['u2', 'Turnen', day(10), 'RECURRENCE-ID:y\r\n'], ['u3', 'Abgesagt', day(4), 'STATUS:CANCELLED\r\n']])
      : ics([['w1', 'Meeting & Planung', day(5)]]);
    return send(207, multistatus(`<D:response><D:href>${req.url}a.ics</D:href><D:propstat><D:prop><C:calendar-data>${data.replace(/&/g, '&amp;')}</C:calendar-data></D:prop></D:propstat></D:response>`));
  }
  send(404, '');
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${mock.address().port}`;
try {
  const { fetchCaldavEvents, discoverCalendars, assertSafeCaldavUrl } = await import('../server/caldav.mjs');
  const events = await fetchCaldavEvents({ url: base, username: 'anna', password: 'secret' }, 'conn1');
  const titles = events.map(event => event.title).sort();
  assert.deepEqual(titles, ['Meeting & Planung', 'Turnen', 'Turnen', 'Zahnarzt'], 'two event calendars read, task list skipped, cancelled skipped, expanded recurrences kept');
  assert.equal(new Set(events.map(event => event.providerId)).size, events.length, 'expanded instances get unique ids');
  assert.ok(events.every(event => event.providerId.startsWith('conn1-')), 'ids are prefixed with the connection id');
  assert.ok(methods.includes('PROPFIND /.well-known/caldav'), 'falls back to /.well-known/caldav');
  await assert.rejects(fetchCaldavEvents({ url: base, username: 'anna', password: 'wrong' }, 'c'), /caldav_auth_failed/);
  const direct = await discoverCalendars(`${base}/dav/cals/home/`, 'anna', 'secret');
  assert.equal(direct.length, 1, 'a direct calendar URL is used as is');
  delete process.env.CALDAV_ALLOW_INSECURE_TEST;
  assert.throws(() => assertSafeCaldavUrl('http://example.com/'), /caldav_https_required/);
  assert.throws(() => assertSafeCaldavUrl('https://localhost/'), /invalid_caldav_url/);
  assert.throws(() => assertSafeCaldavUrl('https://192.168.1.5/dav'), /invalid_caldav_url/);
  assert.doesNotThrow(() => assertSafeCaldavUrl('https://caldav.icloud.com'));
  console.log('caldav: discovery, multi-calendar read, recurrence, auth failure, URL guard passed');
} finally { mock.close(); }
