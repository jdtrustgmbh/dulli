// Google import: all calendars, pagination beyond 100 events, cancelled and duplicate events handled (mock Google API).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const requests = []; const base = Math.floor(Date.now() / 1000) * 1000;
const mock = createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); requests.push(url.pathname + url.search);
  const send = body => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/users/me/calendarList') return send({ items: [{ id: 'me@example.com', primary: true, summary: 'Me' }, { id: 'family@group.calendar.google.com', summary: 'Familie', selected: true }, { id: 'hidden@group', summary: 'Hidden', selected: false }] });
  const start = i => ({ dateTime: new Date(base + i * 3600_000).toISOString() });
  if (url.pathname === '/calendars/primary/events') {
    const page = Number(url.searchParams.get('pageToken') || 0);
    const items = Array.from({ length: 250 }, (_, n) => ({ id: `p${page}-${n}`, iCalUID: `uid-p${page}-${n}`, summary: `Event ${page}-${n}`, start: start(page * 250 + n), end: start(page * 250 + n + 1) }));
    if (page === 0) items.push({ id: 'gone', status: 'cancelled', summary: 'Cancelled', start: start(1) }, { id: 'shared-invite', iCalUID: 'shared-uid', summary: 'Invite', start: start(5) }, { id: 'allday', summary: 'Birthday', start: { date: '2026-12-24' }, end: { date: '2026-12-25' } });
    return send({ items, nextPageToken: page < 2 ? String(page + 1) : undefined });
  }
  if (url.pathname === '/calendars/family%40group.calendar.google.com/events') return send({ items: [{ id: 'fam-1', iCalUID: 'fam-uid-1', summary: 'Schulfest', start: start(30), end: start(31) }, { id: 'shared-invite-copy', iCalUID: 'shared-uid', summary: 'Invite', start: start(5) }] });
  res.writeHead(404); res.end('{}');
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
process.env.GOOGLE_API_BASE = `http://127.0.0.1:${mock.address().port}`;
try {
  const { fetchGoogleEvents } = await import('../server/calendar-providers.mjs');
  const events = await fetchGoogleEvents('token', 'conn1');
  const titles = events.map(event => event.title);
  assert.equal(events.filter(event => event.title.startsWith('Event ')).length, 750, 'all pages of the primary calendar are read (not just the first 100)');
  assert.ok(titles.includes('Schulfest'), 'secondary calendars are included');
  assert.equal(titles.filter(title => title === 'Invite').length, 1, 'an invitation present in two calendars is shown once');
  assert.ok(!titles.includes('Cancelled'), 'cancelled events are skipped');
  assert.ok(!requests.some(request => request.includes('hidden')), 'unselected calendars are not read');
  const allDay = events.find(event => event.title === 'Birthday'); assert.equal(allDay.allDay, true);
  assert.equal(new Set(events.map(event => event.providerId)).size, events.length, 'provider ids are unique');
  assert.ok(events.every(event => event.providerId.startsWith('conn1-')));
  assert.ok(requests.some(request => request.includes('timeMax=')), 'a future window is requested');
  console.log('google-sync: all calendars, pagination (750+ events), cancelled/duplicates handled passed');
} finally { mock.close(); }
