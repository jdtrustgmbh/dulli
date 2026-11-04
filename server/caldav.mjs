// Read-only CalDAV client (iCloud, Nextcloud, Fastmail, Synology, ...): Basic auth, calendar discovery, REPORT with server-side
// recurrence expansion. Credentials come from the household owner; the server only ever reads events.
import { parseIcs } from './calendar-providers.mjs';

const TIMEOUT_MS = 20000;
const MAX_CALENDARS = 10;
const NS = '(?:[\\w-]+:)?';

// Light SSRF guard: https only, and no literal localhost / private-range hosts.
export function assertSafeCaldavUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('invalid_caldav_url'); }
  if (process.env.CALDAV_ALLOW_INSECURE_TEST === '1') return url; // tests only: mock server on localhost
  if (url.protocol !== 'https:') throw new Error('caldav_https_required');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/.test(host)) throw new Error('invalid_caldav_url');
  return url;
}

const tagValues = (xml, tag) => [...xml.matchAll(new RegExp(`<${NS}${tag}\\b[^>]*>([\\s\\S]*?)</${NS}${tag}>`, 'gi'))].map(match => match[1]);
const hrefOf = xml => (tagValues(xml, 'href')[0] ?? '').trim().replace(/&amp;/g, '&');
const responses = xml => tagValues(xml, 'response');

async function dav(url, { method, depth, body, auth }) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: auth, Depth: String(depth ?? 0), 'Content-Type': 'application/xml; charset=utf-8' },
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
    const next = new URL(response.headers.get('location'), url).toString(); assertSafeCaldavUrl(next);
    return dav(next, { method, depth, body, auth });
  }
  if (response.status === 401 || response.status === 403) throw new Error('caldav_auth_failed');
  if (response.status >= 400) throw new Error(`caldav_http_${response.status}`);
  return { text: await response.text(), url };
}

const PRINCIPAL_BODY = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:current-user-principal/><c:calendar-home-set/></d:prop></d:propfind>';
const LIST_BODY = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>';

// Returns [{ url, name }] for every event calendar reachable from the given server or calendar URL.
export async function discoverCalendars(rawUrl, username, password) {
  const start = assertSafeCaldavUrl(rawUrl);
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const resolve = (href, base) => new URL(href, base).toString();
  const isCalendar = block => new RegExp(`<${NS}resourcetype\\b[\\s\\S]*?<${NS}calendar\\b`, 'i').test(block);

  let first;
  try { first = await dav(start.toString(), { method: 'PROPFIND', depth: 0, body: PRINCIPAL_BODY, auth }); }
  catch (error) {
    if (error.message === 'caldav_auth_failed' || start.pathname.startsWith('/.well-known')) throw error;
    first = await dav(new URL('/.well-known/caldav', start).toString(), { method: 'PROPFIND', depth: 0, body: PRINCIPAL_BODY, auth });
  }
  // The URL already is a calendar.
  if (isCalendar(first.text)) return [{ url: first.url, name: tagValues(first.text, 'displayname')[0]?.trim() || '' }];

  let homeUrl = null;
  const home = tagValues(first.text, 'calendar-home-set')[0];
  if (home) homeUrl = resolve(hrefOf(home), first.url);
  if (!homeUrl) {
    const principal = tagValues(first.text, 'current-user-principal')[0];
    if (principal) {
      const second = await dav(resolve(hrefOf(principal), first.url), { method: 'PROPFIND', depth: 0, body: PRINCIPAL_BODY, auth });
      const secondHome = tagValues(second.text, 'calendar-home-set')[0];
      if (secondHome) homeUrl = resolve(hrefOf(secondHome), second.url);
    }
  }
  if (!homeUrl) homeUrl = first.url; // some servers hand out the home collection directly
  assertSafeCaldavUrl(homeUrl);
  const list = await dav(homeUrl, { method: 'PROPFIND', depth: 1, body: LIST_BODY, auth });
  const calendars = [];
  for (const block of responses(list.text)) {
    if (!isCalendar(block)) continue;
    const components = tagValues(block, 'supported-calendar-component-set')[0];
    if (components && !/name="VEVENT"/i.test(components)) continue; // task/notes-only collections
    const href = hrefOf(block); if (!href) continue;
    calendars.push({ url: resolve(href, list.url), name: tagValues(block, 'displayname')[0]?.trim() || '' });
    if (calendars.length >= MAX_CALENDARS) break;
  }
  if (!calendars.length) throw new Error('caldav_no_calendars');
  return calendars;
}

const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const reportBody = (from, to, expand) => `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data>${expand ? `<c:expand start="${stamp(from)}" end="${stamp(to)}"/>` : ''}</c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(from)}" end="${stamp(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;

async function reportCalendar(calendarUrl, auth, from, to) {
  let result;
  try { result = await dav(calendarUrl, { method: 'REPORT', depth: 1, body: reportBody(from, to, true), auth }); }
  catch (error) { if (error.message === 'caldav_auth_failed') throw error; result = await dav(calendarUrl, { method: 'REPORT', depth: 1, body: reportBody(from, to, false), auth }); }
  const text = tagValues(result.text, 'calendar-data').map(item => item.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/^<!\[CDATA\[|\]\]>$/g, '')).join('\n');
  return text;
}

// All events from about 30 days back to one year ahead, across every event calendar of the account.
export async function fetchCaldavEvents({ url, username, password }, prefix) {
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const calendars = await discoverCalendars(url, username, password);
  const from = new Date(Date.now() - 30 * 86400000); const to = new Date(Date.now() + 365 * 86400000);
  const byId = new Map();
  for (const calendar of calendars) {
    const text = await reportCalendar(calendar.url, auth, from, to);
    for (const event of parseIcs(text, `${prefix}-${calendars.indexOf(calendar)}`, { uniquePerStart: true })) byId.set(event.providerId, event);
  }
  return [...byId.values()];
}
