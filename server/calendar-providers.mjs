// Calendar providers: capability matrix, Google and Microsoft OAuth helpers, ICS import.
export const PROVIDERS = Object.freeze({
  google: { label: 'Google Calendar', read: true, write: true, incremental: true, recurrence: true, auth: 'oauth' },
  outlook: { label: 'Microsoft Outlook', read: true, write: true, incremental: true, recurrence: true, auth: 'oauth' },
  caldav: { label: 'CalDAV (iCloud, Nextcloud, Fastmail ...)', read: true, write: false, incremental: false, recurrence: true, auth: 'caldav' },
  ics: { label: 'ICS link', read: true, write: false, incremental: false, recurrence: 'best-effort', auth: 'url' }
});
export function providerCapabilities(provider) { return PROVIDERS[provider] ?? { label: 'Unconfigured provider', read: false, write: false, incremental: false, recurrence: false, auth: 'none' }; }

import { createHash } from 'node:crypto';
// No provider call may hang the sync button: every request gets a hard timeout.
const REQUEST_TIMEOUT_MS = 20000;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const GOOGLE_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
// Read-only is enough: Dulli only displays Google events and never writes to Google Calendar.
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

const msTenant = () => process.env.MICROSOFT_TENANT_ID || 'common';
const msAuthUrl = () => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/authorize`;
const msTokenUrl = () => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/token`;
const MS_EVENTS_URL = 'https://graph.microsoft.com/v1.0/me/calendarView';
const MS_SCOPE = 'offline_access Calendars.ReadWrite';

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function microsoftConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_REDIRECT_URI);
}

export function buildGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeGoogleCode(code) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
      code
    })
  });
  if (!response.ok) throw new Error(`google_token_exchange_failed: ${await response.text()}`);
  return response.json();
}

export async function refreshGoogleToken(refreshToken) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!response.ok) throw new Error(`google_token_refresh_failed: ${await response.text()}`);
  return response.json();
}

export async function fetchGoogleAccountInfo(accessToken) {
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`google_calendar_info_fetch_failed: ${await response.text()}`);
  const data = await response.json();
  return { email: data.id ?? null, name: data.summary ?? null };
}

const GOOGLE_API = process.env.GOOGLE_API_BASE || 'https://www.googleapis.com/calendar/v3';
// Hard caps so one huge account cannot exhaust memory: events per calendar, calendars per connection.
const GOOGLE_MAX_EVENTS_PER_CALENDAR = 2500;
const GOOGLE_MAX_CALENDARS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

async function googleGet(accessToken, url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`google_events_fetch_failed: ${response.status} ${await response.text()}`);
  return response.json();
}

// Every calendar the account shows (primary, shared family calendars, subscribed ones), not only "primary".
async function googleCalendars(accessToken) {
  const calendars = [];
  let pageToken = '';
  try {
    do {
      const params = new URLSearchParams({ maxResults: '250', ...(pageToken ? { pageToken } : {}) });
      const data = await googleGet(accessToken, `${GOOGLE_API}/users/me/calendarList?${params}`);
      for (const item of data.items ?? []) if (!item.deleted && item.selected !== false && item.hidden !== true) calendars.push({ id: item.primary ? 'primary' : item.id, name: item.summaryOverride || item.summary || '', primary: Boolean(item.primary) });
      pageToken = data.nextPageToken ?? '';
    } while (pageToken && calendars.length < GOOGLE_MAX_CALENDARS);
  } catch { /* fall back to the primary calendar below */ }
  if (!calendars.some(item => item.primary)) calendars.unshift({ id: 'primary', name: '', primary: true });
  return calendars.slice(0, GOOGLE_MAX_CALENDARS);
}

export async function fetchGoogleEvents(accessToken, prefix = 'google') {
  const timeMin = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const timeMax = new Date(Date.now() + 400 * DAY_MS).toISOString();
  const result = new Map(); const seen = new Set(); let failures = 0;
  const calendars = await googleCalendars(accessToken);
  for (const calendar of calendars) {
    try {
      let pageToken = ''; let count = 0;
      do {
        const params = new URLSearchParams({ timeMin, timeMax, maxResults: '250', singleEvents: 'true', orderBy: 'startTime', ...(pageToken ? { pageToken } : {}) });
        const data = await googleGet(accessToken, `${GOOGLE_API}/calendars/${encodeURIComponent(calendar.id)}/events?${params}`);
        for (const event of data.items ?? []) {
          if (event.status === 'cancelled') continue;
          const startsAt = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00` : null);
          if (!startsAt) continue;
          // The same invitation can sit in several calendars of one account: show it once.
          const identity = `${event.iCalUID ?? event.id}|${startsAt}`;
          if (seen.has(identity)) continue; seen.add(identity);
          const providerId = calendar.primary ? `${prefix}-${event.id}` : `${prefix}-${createHash('sha1').update(calendar.id).digest('hex').slice(0, 8)}-${event.id}`;
          result.set(providerId, {
            providerId,
            title: event.summary?.trim() || 'Untitled event',
            startsAt,
            endsAt: event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00` : null),
            owner: 'Shared',
            owners: ['Shared'],
            recurrence: event.recurringEventId ? 'recurring' : null,
            allDay: !event.start?.dateTime,
            eventType: event.eventType ?? null,
            location: event.location?.trim() || null,
            calendar: calendar.name || null
          });
          if (++count >= GOOGLE_MAX_EVENTS_PER_CALENDAR) break;
        }
        pageToken = count >= GOOGLE_MAX_EVENTS_PER_CALENDAR ? '' : (data.nextPageToken ?? '');
      } while (pageToken);
    } catch (error) { failures += 1; if (calendars.length === 1) throw error; }
  }
  if (failures === calendars.length) throw new Error('google_events_fetch_failed: no calendar could be read');
  return [...result.values()];
}

export function buildMicrosoftAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
    response_type: 'code',
    response_mode: 'query',
    scope: MS_SCOPE,
    state
  });
  return `${msAuthUrl()}?${params}`;
}

export async function exchangeMicrosoftCode(code) {
  const response = await fetch(msTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
      grant_type: 'authorization_code',
      code,
      scope: MS_SCOPE
    })
  });
  if (!response.ok) throw new Error(`microsoft_token_exchange_failed: ${await response.text()}`);
  return response.json();
}

export async function refreshMicrosoftToken(refreshToken) {
  const response = await fetch(msTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MS_SCOPE
    })
  });
  if (!response.ok) throw new Error(`microsoft_token_refresh_failed: ${await response.text()}`);
  return response.json();
}

export async function fetchMicrosoftAccountInfo(accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me/calendar', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`microsoft_calendar_info_fetch_failed: ${await response.text()}`);
  const data = await response.json();
  return { email: data.owner?.address ?? null, name: data.owner?.name ?? data.name ?? null };
}

export async function fetchMicrosoftEvents(accessToken, prefix = 'outlook') {
  const startDateTime = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const endDateTime = new Date(Date.now() + 400 * DAY_MS).toISOString();
  const params = new URLSearchParams({ startDateTime, endDateTime, $top: '250', $orderby: 'start/dateTime' });
  let next = `${MS_EVENTS_URL}?${params}`; const items = [];
  for (let page = 0; next && page < 20; page++) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`microsoft_events_fetch_failed: ${await response.text()}`);
    const data = await response.json();
    items.push(...(data.value ?? [])); next = data['@odata.nextLink'] ?? '';
  }
  return items
    .filter(event => !event.isCancelled)
    .map(event => ({
      providerId: `${prefix}-${event.id}`,
      title: event.subject?.trim() || 'Untitled event',
      startsAt: event.start?.dateTime ? `${event.start.dateTime}Z` : null,
      endsAt: event.end?.dateTime ? `${event.end.dateTime}Z` : null,
      owner: 'Shared',
      owners: ['Shared'],
      recurrence: event.type === 'occurrence' || event.type === 'seriesMaster' ? 'recurring' : null,
      allDay: Boolean(event.isAllDay),
      eventType: null,
      location: event.location?.displayName?.trim() || null
    }))
    .filter(event => event.startsAt);
}

export async function fetchIcsEvents(url, prefix = 'ics') {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`ics_fetch_failed: ${response.status}`);
  const text = await response.text();
  return parseIcs(text, prefix);
}

export function parseIcs(text, prefix = 'ics', { uniquePerStart = false } = {}) {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r\n|\n/);
  const raw = [];
  let current = null; let inAlarm = false;
  for (const line of lines) {
    if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (line === 'END:VALARM') { inAlarm = false; continue; }
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current) raw.push(current); current = null; continue; }
    if (!current || inAlarm) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) continue;
    const key = line.slice(0, separatorIndex).split(';')[0];
    const value = line.slice(separatorIndex + 1);
    if (key === 'SUMMARY') current.title = value;
    if (key === 'UID') current.uid = value;
    if (key === 'DTSTART') { current.startsAt = parseIcsDate(value); current.allDay = !/T\d{6}/.test(value); }
    if (key === 'DTEND') current.endsAt = parseIcsDate(value);
    if (key === 'LOCATION') current.location = value;
    if (key === 'STATUS' && value.toUpperCase() === 'CANCELLED') current.cancelled = true;
  }
  return raw
    .filter(event => event.startsAt && event.title && !event.cancelled)
    .map(event => ({
      providerId: uniquePerStart ? `${prefix}-${event.uid || event.title}-${event.startsAt}` : `${prefix}-${event.uid || `${event.title}-${event.startsAt}`}`,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt ?? null,
      owner: 'Shared',
      owners: ['Shared'],
      recurrence: null,
      allDay: Boolean(event.allDay),
      eventType: null,
      location: event.location?.trim() || null
    }));
}

function parseIcsDate(value) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', zulu] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${zulu ? 'Z' : ''}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
