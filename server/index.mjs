import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { parseCapture } from './stores.mjs';
import { PROVIDERS } from './calendar-providers.mjs';
import { googleConfigured, microsoftConfigured, buildGoogleAuthUrl, exchangeGoogleCode, refreshGoogleToken, fetchGoogleEvents, fetchGoogleAccountInfo, buildMicrosoftAuthUrl, exchangeMicrosoftCode, refreshMicrosoftToken, fetchMicrosoftEvents, fetchMicrosoftAccountInfo, fetchIcsEvents } from './calendar-providers.mjs';
import { createAuthStore, hashPassword, verifyPassword } from './auth.mjs';
import { createHouseholdBundle, serializeBundle, deserializeBundle } from './tenancy.mjs';
import { fetchCaldavEvents, discoverCalendars } from './caldav.mjs';
import pg from 'pg';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

let sessionSecret = null;
const auth = createAuthStore({ getSessionSecret: () => sessionSecret });
const bundles = new Map();
function getBundle(householdId) {
  let bundle = bundles.get(householdId);
  if (!bundle) { bundle = createHouseholdBundle(householdId); bundles.set(householdId, bundle); requestScope.getStore()?.households.add(householdId); }
  return bundle;
}



const stateFile = process.env.STATE_FILE;
const realtimeClients = new Map();

// ---- per-household data separation helpers -------------------------------------------------
// Every API handler resolves its data from `account.householdId` (see `bundle` below); nothing
// else keys tenant data. These helpers only manage accounts that belong to the same household.
const householdAccounts = householdId => [...auth.accounts.values()].filter(item => item.householdId === householdId);
const isOwner = item => (item.role ?? 'owner') === 'owner';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const hashInviteCode = code => createHash('sha256').update(String(code)).digest('hex');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Small in-memory throttle for credential endpoints: `limit` hits per window per key.
const throttleHits = new Map();
function throttled(key, limit = 20, windowMs = 15 * 60 * 1000) {
  const now = Date.now(); const hits = (throttleHits.get(key) ?? []).filter(time => now - time < windowMs);
  hits.push(now); throttleHits.set(key, hits);
  if (throttleHits.size > 5000) for (const [name, list] of throttleHits) if (!list.some(time => now - time < windowMs)) throttleHits.delete(name);
  return hits.length > limit;
}
const clientKey = req => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
async function readJson(req, limit = 100_000) { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > limit) throw new Error('too_large'); } return body ? JSON.parse(body) : {}; }
const database = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined }) : null;

function applySavedPayload(saved) {
  if (!saved) return;
  if (saved.version === 2) {
    if (saved.sessionSecret) sessionSecret = saved.sessionSecret;
    for (const [id, accountData] of saved.accounts ?? []) auth.accounts.set(id, accountData);
    for (const [householdId, bundlePayload] of Object.entries(saved.households ?? {})) bundles.set(householdId, deserializeBundle(householdId, bundlePayload));
  } else if (saved.households || saved.tasks) {
    // legacy single-tenant payload: migrate everything into one 'demo' household bundle
    const legacyBundle = deserializeBundle('demo', {
      household: (saved.households ?? [])[0]?.[1] ?? {},
      invites: saved.invites, captures: saved.captures, tasks: saved.tasks, listItems: saved.listItems, photos: saved.photos,
      listNames: saved.listNames, events: saved.events,
      providerTokens: saved.providerTokens, providerIcsUrls: saved.providerIcsUrls
    });
    bundles.set('demo', legacyBundle);
  }
}

// ---- PostgreSQL persistence: one row per household (jd_households) and one per login (jd_accounts) ----
// Tenant data never shares a row: a request only ever reads/writes the household row of its own account.
// Without DATABASE_URL (local dev, tests) the same state is kept in STATE_FILE instead.
const requestScope = new AsyncLocalStorage();
const written = { households: new Map(), accounts: new Map(), secret: null };
let persistChain = Promise.resolve();

async function ensureSchema() {
  await database.query(`create table if not exists jd_meta (key text primary key, value text not null)`);
  await database.query(`create table if not exists jd_households (id text primary key, payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`);
  await database.query(`create table if not exists jd_accounts (id text primary key, email text not null unique, household_id text not null references jd_households(id) on delete cascade, role text not null default 'owner', tier text, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`);
  await database.query(`create index if not exists jd_accounts_household_idx on jd_accounts (household_id)`);
}

async function loadDatabaseState() {
  if (!database) return;
  await ensureSchema();
  const households = await database.query('select id, payload from jd_households');
  if (households.rowCount === 0) {
    // First start on PostgreSQL: adopt the state file (already loaded) or the legacy single-row state, then write it out per household.
    if (auth.accounts.size === 0 && bundles.size === 0) {
      const legacy = await database.query(`select payload from app_state where id = 'root'`).catch(() => null);
      applySavedPayload(legacy?.rows?.[0]?.payload);
    }
    if (auth.accounts.size || bundles.size) { await persistState(); console.log(`[postgres] imported ${bundles.size} household(s) and ${auth.accounts.size} account(s)`); }
    return;
  }
  // The database is authoritative once it holds data.
  bundles.clear(); auth.accounts.clear(); sessionSecret = null;
  for (const row of households.rows) { const bundle = deserializeBundle(row.id, row.payload); bundles.set(row.id, bundle); const legacyPlaintext = [...(row.payload.providerTokens ?? []), ...(row.payload.providerIcsUrls ?? [])].some(([, value]) => !(typeof value === 'string' && value.startsWith('enc:v1:'))); if (!legacyPlaintext) written.households.set(row.id, JSON.stringify(serializeBundle(bundle))); /* legacy plaintext credentials stay unwritten so the next save re-stores them encrypted */ }
  for (const row of (await database.query('select id, data from jd_accounts')).rows) { auth.accounts.set(row.id, row.data); written.accounts.set(row.id, JSON.stringify(row.data)); }
  const secret = await database.query(`select value from jd_meta where key = 'sessionSecret'`);
  if (secret.rows[0]) { sessionSecret = secret.rows[0].value; written.secret = sessionSecret; }
}

function persistDatabase(scope) {
  const run = async () => {
    // Households: the ones this request touched, plus any not yet stored (new signups). Accounts are small, so all are diffed.
    const ids = new Set(scope ? scope.households : bundles.keys());
    for (const account of auth.accounts.values()) if (!written.households.has(account.householdId)) ids.add(account.householdId);
    const householdRows = [];
    for (const id of ids) { const bundle = bundles.get(id); if (!bundle) continue; const payload = JSON.stringify(serializeBundle(bundle)); if (written.households.get(id) !== payload) householdRows.push([id, payload]); }
    const accountRows = [];
    for (const account of auth.accounts.values()) { const payload = JSON.stringify(account); if (written.accounts.get(account.id) !== payload) accountRows.push([account, payload]); }
    const deletedAccounts = [...written.accounts.keys()].filter(id => !auth.accounts.has(id));
    const deletedHouseholds = [...written.households.keys()].filter(id => !bundles.has(id));
    const secretChanged = sessionSecret && written.secret !== sessionSecret;
    if (!householdRows.length && !accountRows.length && !deletedAccounts.length && !deletedHouseholds.length && !secretChanged) return;
    const client = await database.connect();
    try {
      await client.query('begin');
      for (const id of deletedAccounts) await client.query('delete from jd_accounts where id = $1', [id]);
      for (const id of deletedHouseholds) await client.query('delete from jd_households where id = $1', [id]);
      for (const [id, payload] of householdRows) await client.query('insert into jd_households (id, payload) values ($1, $2::jsonb) on conflict (id) do update set payload = excluded.payload, updated_at = now()', [id, payload]);
      for (const [account, payload] of accountRows) await client.query(`insert into jd_accounts (id, email, household_id, role, tier, data) values ($1, $2, $3, $4, $5, $6::jsonb) on conflict (id) do update set email = excluded.email, household_id = excluded.household_id, role = excluded.role, tier = excluded.tier, data = excluded.data, updated_at = now()`, [account.id, account.email, account.householdId, account.role ?? 'owner', account.tier ?? null, payload]);
      if (secretChanged) await client.query(`insert into jd_meta (key, value) values ('sessionSecret', $1) on conflict (key) do update set value = excluded.value`, [sessionSecret]);
      await client.query('commit');
    } catch (error) { await client.query('rollback').catch(() => {}); throw error; } finally { client.release(); }
    for (const id of deletedAccounts) written.accounts.delete(id);
    for (const id of deletedHouseholds) written.households.delete(id);
    for (const [id, payload] of householdRows) written.households.set(id, payload);
    for (const [account, payload] of accountRows) written.accounts.set(account.id, payload);
    if (secretChanged) written.secret = sessionSecret;
  };
  persistChain = persistChain.then(run, run); // one writer at a time; a failed write does not block later ones
  return persistChain;
}

function serializePayload() {
  return {
    version: 2,
    sessionSecret,
    accounts: [...auth.accounts],
    households: Object.fromEntries([...bundles].map(([id, bundle]) => [id, serializeBundle(bundle)]))
  };
}

async function persistState() {
  const scope = requestScope.getStore();
  if (scope && !scope.mutating) return; // plain reads never rewrite anything
  if (database) return persistDatabase(scope);
  if (stateFile) { await mkdir(dirname(stateFile), { recursive: true }); await writeFile(stateFile, JSON.stringify(serializePayload(), null, 2), 'utf8'); }
}

if (stateFile) {
  try { applySavedPayload(JSON.parse(await readFile(stateFile, 'utf8'))); } catch {}
}
await loadDatabaseState();

if (!sessionSecret) { sessionSecret = randomBytes(32).toString('hex'); await persistState().catch(() => {}); }

if (auth.accounts.size === 0) {
  const bootstrapEmail = process.env.BOOTSTRAP_EMAIL || 'admin@example.com';
  const bootstrapPassword = process.env.BOOTSTRAP_PASSWORD || randomBytes(9).toString('base64url');
  const householdId = bundles.has('demo') ? 'demo' : randomUUID();
  getBundle(householdId);
  const passwordHash = await hashPassword(bootstrapPassword);
  const account = { id: randomUUID(), email: bootstrapEmail.trim().toLowerCase(), passwordHash, householdId, tier: 'self-hosted', createdAt: new Date().toISOString() };
  auth.accounts.set(account.id, account);
  console.log(`[bootstrap] login created — email: ${account.email} password: ${bootstrapPassword}`);
  await persistState().catch(() => {});
}

const escapeHtml = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const PUBLIC_EXTENSIONS = new Set(['.html', '.css', '.js', '.webmanifest', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.ttf', '.woff2']);
function isPublicAsset(requested) {
  if (requested.includes('%') || requested.includes('\\') || requested.includes('..') || requested.includes('\0')) return false;
  const segments = requested.split('/').filter(Boolean);
  if (!segments.length || segments.some(segment => segment.startsWith('.'))) return false;
  if (!PUBLIC_EXTENSIONS.has(extname(requested).toLowerCase())) return false;
  return true; // everything below public/ is meant to be served
}
const securityHeaders ={ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
async function json(res, status, body, extraHeaders = {}) { await persistState().catch(error => console.error('[persist failed]', error?.message ?? error)); res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }); res.end(JSON.stringify(body)); }

const EVENT_RECURRENCES = ['daily', 'weekly', 'monthly', 'yearly'];
const EVENT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Optional event fields from the calendar editor; only keys present in the payload are returned.
function eventExtras(input) {
  const out = {};
  if (input.recurrence !== undefined) out.recurrence = EVENT_RECURRENCES.includes(input.recurrence) ? input.recurrence : null;
  if (input.recurrenceDays !== undefined) { const days = Array.isArray(input.recurrenceDays) ? EVENT_DAYS.filter(day => input.recurrenceDays.includes(day)) : []; out.recurrenceDays = days.length ? days : null; }
  if (input.description !== undefined) out.description = String(input.description ?? '').trim().slice(0, 2000) || null;
  if (input.reminderMinutes !== undefined) { const minutes = Number(input.reminderMinutes); out.reminderMinutes = input.reminderMinutes === null || input.reminderMinutes === '' || !Number.isFinite(minutes) || minutes < 0 ? null : minutes; }
  return out;
}
// Events of a connection marked private are only ever served as anonymous "Busy" blocks.
// Owner of a connected calendar (a household member or "Shared"): applied to its events when they are served.
function ownerMask(calendarConnections) {
  const owned = (calendarConnections ?? []).filter(item => item.owner).map(item => [`${item.id}-`, item.owner]);
  return event => { const hit = owned.find(([prefix]) => event.providerId?.startsWith(prefix)); return hit ? { ...event, owner: hit[1], owners: [hit[1]] } : event; };
}
function privacyMask(calendarConnections) {
  const prefixes = (calendarConnections ?? []).filter(item => item.private).map(item => `${item.id}-`);
  return event => (prefixes.some(prefix => event.providerId?.startsWith(prefix)) ? { providerId: event.providerId, title: 'Busy', startsAt: event.startsAt, endsAt: event.endsAt ?? null, allDay: Boolean(event.allDay), owner: event.owner, owners: event.owners ?? [event.owner], recurrence: null, recurrenceDays: null, eventType: null, location: null, description: null, private: true } : event);
}

// ---- calendar provider sync (manual button, app open, and a background timer) ----
// Replaces the connection's events with what the provider currently has; tokens are refreshed when close to expiry.
async function syncConnection(bundle, connection) {
  const { events, providerTokens, providerIcsUrls } = bundle; let fetched;
  if (connection.provider === 'google' || connection.provider === 'outlook') {
    const token = providerTokens.get(connection.id); if (!token) throw new Error('provider_not_connected');
    const google = connection.provider === 'google';
    if (token.expiresAt < Date.now() + 60000) {
      let refreshed;
      try { refreshed = await (google ? refreshGoogleToken : refreshMicrosoftToken)(token.refreshToken); }
      catch (error) { if (/invalid_grant|invalid_client|AADSTS70008|AADSTS700082/.test(String(error.message))) { connection.status = 'reauth_required'; connection.lastError = 'reauth_required'; throw new Error('reauth_required'); } throw error; }
      token.accessToken = refreshed.access_token; token.expiresAt = Date.now() + (refreshed.expires_in ?? 3600) * 1000;
    }
    const info = await (google ? fetchGoogleAccountInfo : fetchMicrosoftAccountInfo)(token.accessToken).catch(() => null); if (info?.email || info?.name) connection.label = info.email || info.name;
    fetched = await (google ? fetchGoogleEvents : fetchMicrosoftEvents)(token.accessToken, connection.id);
  } else if (connection.provider === 'caldav') {
    const credentials = providerTokens.get(connection.id); if (!credentials?.caldav) throw new Error('provider_not_connected');
    try { fetched = await fetchCaldavEvents(credentials, connection.id); }
    catch (error) { if (error.message === 'caldav_auth_failed') { connection.status = 'reauth_required'; connection.lastError = 'reauth_required'; throw new Error('reauth_required'); } throw error; }
  } else if (connection.provider === 'ics') {
    const icsUrl = providerIcsUrls.get(connection.id); if (!icsUrl) throw new Error('provider_not_connected');
    fetched = await fetchIcsEvents(icsUrl, connection.id);
  } else throw new Error('provider_not_found');
  for (const key of [...events.keys()]) if (key.startsWith(`${connection.id}-`)) events.delete(key);
  for (const event of fetched) events.set(event.providerId, event);
  connection.lastSyncAt = new Date().toISOString(); connection.lastCount = fetched.length; delete connection.lastError; if (connection.status === 'reauth_required') connection.status = 'connected';
  return fetched.length;
}
async function syncHousehold(bundle) {
  return Promise.all([...bundle.calendarConnections].map(async connection => {
    try { return { id: connection.id, count: await syncConnection(bundle, connection) }; }
    catch (error) { connection.lastError = String(error.message ?? error).slice(0, 200); return { id: connection.id, error: error.message === 'reauth_required' ? 'reauth_required' : 'provider_sync_failed' }; }
  }));
}
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
setInterval(async () => {
  try { for (const bundle of bundles.values()) if (bundle.calendarConnections.length) await syncHousehold(bundle); await persistState(); }
  catch (error) { console.error('[background sync failed]', error?.message ?? error); }
}, SYNC_INTERVAL_MS).unref();

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'jd-planning', mode: database ? 'postgres' : 'local-demo' });

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk;
    if (throttled(`login:${clientKey(req)}`, 30)) return json(res, 429, { error: 'too_many_attempts' });
    try {
      const { email, password } = JSON.parse(body);
      const account = auth.findAccountByEmail(email ?? '');
      if (!account || !account.passwordHash || !(await verifyPassword(password ?? '', account.passwordHash))) return json(res, 401, { error: 'invalid_credentials' });
      const token = auth.createSession(account.id);
      auth.setSessionCookie(res, token);
      return json(res, 200, { email: account.email, tier: account.tier });
    } catch { return json(res, 400, { error: 'invalid_json' }); }
  }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { auth.destroySession(auth.sessionCookieValue(req)); auth.clearSessionCookie(res); return json(res, 200, { ok: true }); }

  const sessionToken = auth.sessionCookieValue(req);
  const account = auth.resolveSession(sessionToken);

  if (url.pathname === '/api/auth/me' && req.method === 'GET') { if (!account) return json(res, 401, { error: 'unauthenticated' }); return json(res, 200, { email: account.email, tier: account.tier, needsPassword: !account.passwordHash }); }
  if (url.pathname === '/api/auth/set-password' && req.method === 'POST') {
    if (!account) return json(res, 401, { error: 'unauthenticated' });
    let body = ''; for await (const chunk of req) body += chunk;
    try { const { password } = JSON.parse(body); if (!password || password.length < 8) return json(res, 400, { error: 'password_too_short' }); account.passwordHash = await hashPassword(password); account.sessionsValidFrom = Date.now(); auth.setSessionCookie(res, auth.createSession(account.id)); return json(res, 200, { ok: true }); } catch { return json(res, 400, { error: 'invalid_json' }); }
  }

  if (url.pathname === '/api/auth/join' && req.method === 'POST') {
    if (throttled(`join:${clientKey(req)}`, 15)) return json(res, 429, { error: 'too_many_attempts' });
    let input; try { input = await readJson(req); } catch { return json(res, 400, { error: 'invalid_json' }); }
    const email = String(input.email ?? '').trim().toLowerCase(); const password = String(input.password ?? '');
    if (!EMAIL_PATTERN.test(email)) return json(res, 400, { error: 'invalid_email' });
    if (password.length < 8) return json(res, 400, { error: 'password_too_short' });
    const codeHash = hashInviteCode(input.code ?? '');
    let target = null;
    for (const [householdId, candidate] of bundles) { const invite = candidate.invites.find(item => item.codeHash === codeHash); if (invite) { target = { householdId, candidate, invite }; break; } }
    if (!target || target.invite.expiresAt < Date.now()) return json(res, 400, { error: 'invalid_or_expired_invite' });
    if (target.invite.email && target.invite.email !== email) return json(res, 400, { error: 'invite_for_other_email' });
    if (auth.findAccountByEmail(email)) return json(res, 409, { error: 'email_taken' });
    const owner = householdAccounts(target.householdId).find(isOwner);
    const joined = { id: randomUUID(), email, passwordHash: await hashPassword(password), householdId: target.householdId, role: 'member', tier: owner?.tier ?? 'self-hosted', createdAt: new Date().toISOString() };
    auth.accounts.set(joined.id, joined);
    target.candidate.invites.splice(target.candidate.invites.indexOf(target.invite), 1);
    auth.setSessionCookie(res, auth.createSession(joined.id));
    return json(res, 201, { email: joined.email, role: joined.role });
  }

  // Signup link: SIGNUP_CODE enables /signup?code=... for families that get their own household (limited by SIGNUP_LIMIT).
  const signupCode = process.env.SIGNUP_CODE || '';
  if (url.pathname === '/signup' && req.method === 'GET' && !signupCode) { res.writeHead(404, securityHeaders); return res.end('Not found'); }
  if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
    if (!signupCode) return json(res, 404, { error: 'signup_disabled' });
    if (throttled(`signup:${clientKey(req)}`, 15)) return json(res, 429, { error: 'too_many_attempts' });
    let input; try { input = await readJson(req); } catch { return json(res, 400, { error: 'invalid_json' }); }
    if (hashInviteCode(input.code ?? '') !== hashInviteCode(signupCode)) return json(res, 403, { error: 'invalid_code' });
    const email = String(input.email ?? '').trim().toLowerCase(); const password = String(input.password ?? '');
    if (!EMAIL_PATTERN.test(email)) return json(res, 400, { error: 'invalid_email' });
    if (password.length < 8) return json(res, 400, { error: 'password_too_short' });
    const used = [...auth.accounts.values()].filter(item => item.origin === 'signup-link').length;
    if (used >= Number(process.env.SIGNUP_LIMIT ?? 25)) return json(res, 403, { error: 'signup_limit_reached' });
    if (auth.findAccountByEmail(email)) return json(res, 409, { error: 'email_taken' });
    const householdId = randomUUID(); getBundle(householdId);
    const created = { id: randomUUID(), email, passwordHash: await hashPassword(password), householdId, role: 'owner', tier: process.env.SIGNUP_TIER || 'self-hosted', origin: 'signup-link', createdAt: new Date().toISOString() };
    auth.accounts.set(created.id, created);
    auth.setSessionCookie(res, auth.createSession(created.id));
    return json(res, 201, { email: created.email, role: created.role });
  }

  if ((url.pathname === '/app' || url.pathname === '/display.html') && !account) { res.writeHead(302, { Location: '/login' }); return res.end(); }
  if (url.pathname.startsWith('/api/') && !account) return json(res, 401, { error: 'unauthenticated' });

  const bundle = account ? getBundle(account.householdId) : null;
  if (account) requestScope.getStore()?.households.add(account.householdId);
  const household = bundle?.household;
  const { invites, captures, tasks, listItems, photos, listNames, events, reminders, optionalModules, idempotentCaptures, idempotentReminders, idempotentTasks, idempotentLists, idempotentEvents, idempotentRewards, calendarConnections, providerTokens, providerIcsUrls, oauthStates } = bundle ?? {};
  const listOf = item => item.listName || 'Shared list'; const nextListId = () => `list-${Math.max(listItems.length, ...[...listItems, ...(bundle.lastClearedListItems ?? [])].map(item => Number(String(item.id).replace('list-', '')) || 0)) + 1}`;

  // ---- access management: who can sign in to THIS household ----
  if (url.pathname === '/api/access' && req.method === 'GET') {
    const accounts = householdAccounts(account.householdId).map(item => ({ id: item.id, email: item.email, role: item.role ?? 'owner', createdAt: item.createdAt, you: item.id === account.id }));
    const open = isOwner(account) ? invites.filter(item => item.codeHash && item.expiresAt > Date.now()).map(item => ({ id: item.id, email: item.email ?? null, createdAt: item.createdAt, expiresAt: item.expiresAt })) : [];
    return json(res, 200, { you: account.id, role: account.role ?? 'owner', accounts, invites: open });
  }
  if (url.pathname === '/api/access/invites' && req.method === 'POST') {
    if (!isOwner(account)) return json(res, 403, { error: 'owner_only' });
    let input; try { input = await readJson(req); } catch { return json(res, 400, { error: 'invalid_json' }); }
    const email = String(input.email ?? '').trim().toLowerCase();
    if (email && !EMAIL_PATTERN.test(email)) return json(res, 400, { error: 'invalid_email' });
    if (invites.filter(item => item.codeHash && item.expiresAt > Date.now()).length >= 10) return json(res, 429, { error: 'too_many_open_invites' });
    const code = randomBytes(18).toString('base64url');
    const invite = { id: randomUUID(), codeHash: hashInviteCode(code), email: email || null, createdAt: new Date().toISOString(), expiresAt: Date.now() + INVITE_TTL_MS, createdBy: account.id };
    invites.push(invite);
    const origin = `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers.host}`;
    return json(res, 201, { id: invite.id, code, joinUrl: `${origin}/join?code=${code}`, expiresAt: invite.expiresAt });
  }
  const inviteMatch = url.pathname.match(/^\/api\/access\/invites\/([^/]+)$/);
  if (inviteMatch && req.method === 'DELETE') {
    if (!isOwner(account)) return json(res, 403, { error: 'owner_only' });
    const index = invites.findIndex(item => item.id === inviteMatch[1]); if (index === -1) return json(res, 404, { error: 'invite_not_found' });
    invites.splice(index, 1); return json(res, 200, { revoked: true });
  }
  const accessMatch = url.pathname.match(/^\/api\/access\/([^/]+)$/);
  if (accessMatch && req.method === 'DELETE') {
    if (!isOwner(account)) return json(res, 403, { error: 'owner_only' });
    const target = auth.accounts.get(accessMatch[1]);
    // Scoped to the caller's household: another family's account id looks exactly like a missing one.
    if (!target || target.householdId !== account.householdId) return json(res, 404, { error: 'account_not_found' });
    if (target.id === account.id) return json(res, 400, { error: 'cannot_remove_self' });
    if (isOwner(target)) return json(res, 400, { error: 'cannot_remove_owner' });
    auth.accounts.delete(target.id); // member accounts own no data or subscription; their sessions stop resolving at once
    return json(res, 200, { removed: true, id: target.id });
  }
  if (url.pathname === '/api/auth/logout-all' && req.method === 'POST') { account.sessionsValidFrom = Date.now(); auth.setSessionCookie(res, auth.createSession(account.id)); return json(res, 200, { ok: true }); }
  if (url.pathname === '/api/account' && req.method === 'DELETE') {
    if (throttled(`delete:${account.id}`, 5)) return json(res, 429, { error: 'too_many_attempts' });
    let input; try { input = await readJson(req); } catch { return json(res, 400, { error: 'invalid_json' }); }
    if (!account.passwordHash) return json(res, 400, { error: 'password_required' });
    if (!(await verifyPassword(String(input.password ?? ''), account.passwordHash))) return json(res, 403, { error: 'invalid_password' });
    const others = householdAccounts(account.householdId).filter(item => item.id !== account.id);
    if (isOwner(account) && others.length) return json(res, 409, { error: 'members_remain', hint: 'Remove the other accounts first.' });
    const householdId = account.householdId; const owner = isOwner(account);
    auth.accounts.delete(account.id);
    if (owner) { bundles.delete(householdId); for (const [client, id] of realtimeClients) if (id === householdId) { try { client.end(); } catch { /* already closed */ } realtimeClients.delete(client); } }
    auth.clearSessionCookie(res);
    return json(res, 200, { deleted: true, householdDeleted: owner });
  }
  if (url.pathname === '/api/stream' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.write('event: ready\ndata: {"status":"connected"}\n\n'); realtimeClients.set(res, account.householdId); const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000); req.on('close', () => { clearInterval(heartbeat); realtimeClients.delete(res); }); return; }
  if (url.pathname === '/api/providers' && req.method === 'GET') return json(res, 200, Object.entries(PROVIDERS).filter(([id]) => id !== 'outlook').map(([id, capabilities]) => ({ id, ...capabilities, configured: id === 'google' ? googleConfigured() : id === 'outlook' ? microsoftConfigured() : true })));
  if (url.pathname === '/api/providers/google/connect' && req.method === 'GET') { if (!googleConfigured()) return json(res, 501, { error: 'provider_not_configured', hint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to connect a real Google Calendar.' }); const state = randomUUID(); const reuse = url.searchParams.get('connection'); const existing = reuse ? calendarConnections.find(item => item.id === reuse && item.provider === 'google') : null; oauthStates.set(state, { provider: 'google', householdId: account.householdId, connectionId: existing ? existing.id : randomUUID(), expiresAt: Date.now() + 600000 }); res.writeHead(302, { Location: buildGoogleAuthUrl(state) }); return res.end(); }
  if (url.pathname === '/api/providers/google/callback' && req.method === 'GET') { const state = url.searchParams.get('state'); const entry = [...bundles.values()].flatMap(b => [...b.oauthStates].map(([token, value]) => ({ token, value, bundle: b }))).find(item => item.token === state); const code = url.searchParams.get('code'); if (!entry || entry.value.provider !== 'google' || entry.value.expiresAt < Date.now() || !code) { res.writeHead(302, { Location: '/app?providerError=google' }); return res.end(); } entry.bundle.oauthStates.delete(state); const connectionId = entry.value.connectionId; try { const token = await exchangeGoogleCode(code); entry.bundle.providerTokens.set(connectionId, { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 }); const info = await fetchGoogleAccountInfo(token.access_token).catch(() => ({})); const fetched = await fetchGoogleEvents(token.access_token, connectionId); for (const key of [...entry.bundle.events.keys()]) if (key.startsWith(`${connectionId}-`)) entry.bundle.events.delete(key); for (const event of fetched) entry.bundle.events.set(event.providerId, event); const known = entry.bundle.calendarConnections.find(item => item.id === connectionId); if (known) { known.status = 'connected'; known.connectedAt = new Date().toISOString(); known.label = info.email || info.name || known.label; delete known.lastError; } else entry.bundle.calendarConnections.push({ id: connectionId, provider: 'google', label: info.email || info.name || 'Google Calendar', status: 'connected', connectedAt: new Date().toISOString() }); await persistState().catch(() => {}); res.writeHead(302, { Location: '/app?connected=google' }); return res.end(); } catch { res.writeHead(302, { Location: '/app?providerError=google' }); return res.end(); } }
  if (url.pathname === '/api/providers/outlook/connect' && req.method === 'GET') { if (!microsoftConfigured()) return json(res, 501, { error: 'provider_not_configured', hint: 'Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and MICROSOFT_REDIRECT_URI to connect a real Outlook Calendar.' }); const state = randomUUID(); oauthStates.set(state, { provider: 'outlook', householdId: account.householdId, connectionId: randomUUID(), expiresAt: Date.now() + 600000 }); res.writeHead(302, { Location: buildMicrosoftAuthUrl(state) }); return res.end(); }
  if (url.pathname === '/api/providers/outlook/callback' && req.method === 'GET') { const state = url.searchParams.get('state'); const entry = [...bundles.values()].flatMap(b => [...b.oauthStates].map(([token, value]) => ({ token, value, bundle: b }))).find(item => item.token === state); const code = url.searchParams.get('code'); if (!entry || entry.value.provider !== 'outlook' || entry.value.expiresAt < Date.now() || !code) { res.writeHead(302, { Location: '/app?providerError=outlook' }); return res.end(); } entry.bundle.oauthStates.delete(state); const connectionId = entry.value.connectionId; try { const token = await exchangeMicrosoftCode(code); entry.bundle.providerTokens.set(connectionId, { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 }); const info = await fetchMicrosoftAccountInfo(token.access_token).catch(() => ({})); const fetched = await fetchMicrosoftEvents(token.access_token, connectionId); for (const event of fetched) entry.bundle.events.set(event.providerId, event); entry.bundle.calendarConnections.push({ id: connectionId, provider: 'outlook', label: info.email || info.name || 'Outlook Calendar', status: 'connected', connectedAt: new Date().toISOString() }); await persistState().catch(() => {}); res.writeHead(302, { Location: '/app?connected=outlook' }); return res.end(); } catch { res.writeHead(302, { Location: '/app?providerError=outlook' }); return res.end(); } }
  if (url.pathname === '/api/providers/caldav/connect' && req.method === 'POST') {
    if (!isOwner(account)) return json(res, 403, { error: 'owner_only' });
    if (throttled(`caldav:${account.id}`, 20)) return json(res, 429, { error: 'too_many_attempts' });
    let input; try { input = await readJson(req); } catch { return json(res, 400, { error: 'invalid_json' }); }
    const serverUrl = String(input.url ?? '').trim(); const username = String(input.username ?? '').trim(); const password = String(input.password ?? '');
    if (!serverUrl || !username || !password) return json(res, 400, { error: 'caldav_fields_required' });
    try {
      const connectionId = randomUUID();
      const credentials = { caldav: true, url: serverUrl, username, password };
      const fetched = await fetchCaldavEvents(credentials, connectionId);
      for (const event of fetched) events.set(event.providerId, event);
      providerTokens.set(connectionId, credentials);
      calendarConnections.push({ id: connectionId, provider: 'caldav', label: String(input.label ?? '').trim() || username, status: 'connected', connectedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString(), lastCount: fetched.length });
      return json(res, 200, { id: connectionId, status: 'connected', count: fetched.length });
    } catch (error) { const code = String(error.message ?? ''); return json(res, code === 'caldav_auth_failed' ? 401 : 502, { error: /^(caldav_[a-z_0-9]+|invalid_caldav_url)$/.test(code) ? code : 'caldav_connect_failed' }); }
  }
  if (url.pathname === '/api/providers/ics/connect' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; try { const { url: icsUrl, label } = JSON.parse(body); if (!icsUrl?.trim()) return json(res, 400, { error: 'invalid_ics_url' }); const connectionId = randomUUID(); const fetched = await fetchIcsEvents(icsUrl.trim(), connectionId); for (const event of fetched) events.set(event.providerId, event); providerIcsUrls.set(connectionId, icsUrl.trim()); calendarConnections.push({ id: connectionId, provider: 'ics', label: label?.trim() || icsUrl.trim(), status: 'connected', connectedAt: new Date().toISOString() }); return json(res, 200, { id: connectionId, status: 'connected', count: fetched.length }); } catch { return json(res, 502, { error: 'ics_connect_failed' }); } }
  const providerSync = url.pathname.match(/^\/api\/providers\/connections\/([^/]+)\/sync$/); if (providerSync && req.method === 'POST') { const connection = calendarConnections.find(item => item.id === providerSync[1]); if (!connection) return json(res, 404, { error: 'connection_not_found' }); try { const count = await syncConnection(bundle, connection); return json(res, 200, { id: connection.id, count }); } catch (error) { return json(res, error.message === 'provider_not_connected' || error.message === 'reauth_required' ? 409 : error.message === 'provider_not_found' ? 404 : 502, { error: ['provider_not_connected', 'provider_not_found', 'reauth_required'].includes(error.message) ? error.message : 'provider_sync_failed' }); } }
  if (url.pathname === '/api/providers/sync-all' && req.method === 'POST') { const results = await syncHousehold(bundle); return json(res, 200, results); }
  const providerDisconnect = url.pathname.match(/^\/api\/providers\/connections\/([^/]+)\/disconnect$/); if (providerDisconnect && req.method === 'POST') { const connectionId = providerDisconnect[1]; const index = calendarConnections.findIndex(item => item.id === connectionId); if (index === -1) return json(res, 404, { error: 'connection_not_found' }); calendarConnections.splice(index, 1); providerTokens.delete(connectionId); providerIcsUrls.delete(connectionId); for (const key of [...events.keys()]) if (key.startsWith(`${connectionId}-`)) events.delete(key); return json(res, 200, { id: connectionId, status: 'disconnected' }); }
  const providerColor = url.pathname.match(/^\/api\/providers\/connections\/([^/]+)\/color$/); if (providerColor && req.method === 'POST') { const connectionId = providerColor[1]; const connection = calendarConnections.find(item => item.id === connectionId); if (!connection) return json(res, 404, { error: 'connection_not_found' }); let body = ''; for await (const chunk of req) body += chunk; try { const { color } = JSON.parse(body); if (!/^#[0-9a-fA-F]{6}$/.test(color ?? '')) return json(res, 400, { error: 'invalid_color' }); connection.color = color; return json(res, 200, connection); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  const providerOwner = url.pathname.match(/^\/api\/providers\/connections\/([^/]+)\/owner$/); if (providerOwner && req.method === 'POST') {
    const connection = calendarConnections.find(item => item.id === providerOwner[1]); if (!connection) return json(res, 404, { error: 'connection_not_found' });
    let input; try { input = await readJson(req); } catch { return json(res, 400, { error: 'invalid_json' }); }
    const owner = String(input.owner ?? 'Shared');
    if (owner !== 'Shared' && !(household.members ?? []).includes(owner)) return json(res, 400, { error: 'unknown_member' });
    connection.owner = owner; return json(res, 200, connection);
  }
  const providerPrivacy = url.pathname.match(/^\/api\/providers\/connections\/([^/]+)\/privacy$/); if (providerPrivacy && req.method === 'POST') { const connection = calendarConnections.find(item => item.id === providerPrivacy[1]); if (!connection) return json(res, 404, { error: 'connection_not_found' }); let body = ''; for await (const chunk of req) body += chunk; try { connection.private = Boolean(JSON.parse(body || '{}').private); return json(res, 200, connection); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/provider-connections' && req.method === 'GET') return json(res, 200, calendarConnections);
  if (url.pathname === '/api/rewards' && req.method === 'GET') return json(res, 200, optionalModules.leaderboard());
  if (url.pathname === '/api/rewards/ledger' && req.method === 'GET') return json(res, 200, optionalModules.ledger());
  if (url.pathname === '/api/rewards' && req.method === 'POST') { const key = req.headers['idempotency-key']; if (key && idempotentRewards.has(key)) return json(res, 200, idempotentRewards.get(key)); let body = ''; for await (const chunk of req) body += chunk; try { const value = JSON.parse(body); if (!value.member?.trim()) return json(res, 400, { error: 'invalid_reward' }); const item = optionalModules.award(value.member.trim(), value.points ?? 1, value.reason, key); if (key) idempotentRewards.set(key, item); return json(res, 201, item); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/rewards/redeem' && req.method === 'POST') { const key = req.headers['idempotency-key']; if (key && idempotentRewards.has(key)) return json(res, 200, idempotentRewards.get(key)); let body = ''; for await (const chunk of req) body += chunk; try { const value = JSON.parse(body); if (!value.member?.trim() || !value.reward?.trim() || !Number.isFinite(Number(value.cost)) || Number(value.cost) <= 0) return json(res, 400, { error: 'invalid_redemption' }); const item = optionalModules.redeem(value.member.trim(), value.reward.trim(), value.cost, key); if (key) idempotentRewards.set(key, item); return json(res, 201, item); } catch (error) { return json(res, 409, { error: error.message === 'INSUFFICIENT_REWARD_BALANCE' ? error.message : 'invalid_json' }); } }
  if (url.pathname === '/api/meals' && req.method === 'GET') return json(res, 200, optionalModules.meals());
  if (url.pathname === '/api/meals' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; try { const value = JSON.parse(body); if (!value.day || !value.title?.trim()) return json(res, 400, { error: 'invalid_meal' }); return json(res, 201, optionalModules.addMeal({ ...value, title: value.title.trim() })); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/household/demo/photos' && req.method === 'GET') return json(res, 200, photos);
  if (url.pathname === '/api/household/demo/photos' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; try { const { url: photoUrl } = JSON.parse(body); if (!photoUrl?.trim()) return json(res, 400, { error: 'invalid_photo' }); const photo = { id: `photo-${Date.now()}-${photos.length}`, url: photoUrl.trim(), addedAt: new Date().toISOString() }; photos.push(photo); return json(res, 201, photo); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname.startsWith('/api/household/demo/photos/') && req.method === 'DELETE') { const id = url.pathname.split('/').pop(); const index = photos.findIndex(photo => photo.id === id); if (index === -1) return json(res, 404, { error: 'photo_not_found' }); photos.splice(index, 1); return json(res, 200, { ok: true }); }
  if (url.pathname === '/api/school' && req.method === 'GET') return json(res, 200, optionalModules.school());
  if (url.pathname === '/api/school' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; try { const value = JSON.parse(body); if (!value.child?.trim() || !value.title?.trim() || !value.startsAt) return json(res, 400, { error: 'invalid_school_entry' }); return json(res, 201, optionalModules.addSchoolEntry({ ...value, child: value.child.trim(), title: value.title.trim() })); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname.startsWith('/api/school/') && req.method === 'PUT') { const id = url.pathname.split('/').pop(); let body = ''; for await (const chunk of req) body += chunk; try { const value = JSON.parse(body); if (!value.child?.trim() || !value.title?.trim() || !value.startsAt) return json(res, 400, { error: 'invalid_school_entry' }); const updated = optionalModules.updateSchoolEntry(id, { ...value, child: value.child.trim(), title: value.title.trim() }); if (!updated) return json(res, 404, { error: 'school_entry_not_found' }); return json(res, 200, updated); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname.startsWith('/api/school/') && req.method === 'DELETE') { const id = url.pathname.split('/').pop(); const deleted = optionalModules.deleteSchoolEntry(id); if (!deleted) return json(res, 404, { error: 'school_entry_not_found' }); return json(res, 200, { ok: true }); }
  if (url.pathname === '/api/household/demo' && req.method === 'GET') return json(res, 200, household);
  if (url.pathname === '/api/household/demo' && req.method === 'PUT') { let body = ''; for await (const chunk of req) body += chunk; try { const { name } = JSON.parse(body); if (name?.trim()) household.name = name.trim(); household.version += 1; household.updatedAt = new Date().toISOString(); return json(res, 200, household); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/household/demo/export' && req.method === 'GET') return json(res, 200, { household, tasks, listItems, listNames: [...listNames], events: [...events.values()], reminders: reminders.all(), invites: invites.map(({ codeHash, ...rest }) => rest), captures, calendarConnections, exportedAt: new Date().toISOString() });
  if (url.pathname === '/api/household/demo' && req.method === 'DELETE') {
    if (!isOwner(account)) return json(res, 403, { error: 'owner_only' });
    tasks.splice(0); listItems.splice(0); captures.splice(0); invites.splice(0); events.clear(); calendarConnections.splice(0); providerTokens.clear(); providerIcsUrls.clear();
    listNames.clear(); bundle.lastClearedListItems = []; providerTokens.clear(); providerIcsUrls.clear(); oauthStates.clear();
    idempotentCaptures.clear(); idempotentReminders.clear(); idempotentTasks.clear(); idempotentLists.clear(); idempotentEvents.clear();
    for (const key of Object.keys(bundle.extras)) delete bundle.extras[key];
    household.members = []; household.name = null; household.version += 1; household.updatedAt = new Date().toISOString();
    return json(res, 200, { deleted: true, householdId: account.householdId });
  }
  if (url.pathname === '/api/household/demo/members' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; try { const { name, role = 'adult' } = JSON.parse(body); if (!name?.trim()) return json(res, 400, { error: 'invalid_member' }); const normalized = name.trim(); household.memberRoles ??= {}; household.memberRoles[normalized] = role === 'child' ? 'child' : 'adult'; if (household.members.includes(normalized)) return json(res, 200, { name: normalized, role, householdVersion: household.version, existing: true }); household.members.push(normalized); household.version += 1; return json(res, 201, { name: normalized, role, householdVersion: household.version }); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname.startsWith('/api/household/demo/members/') && req.method === 'DELETE') { const name = decodeURIComponent(url.pathname.slice('/api/household/demo/members/'.length)); const index = household.members.indexOf(name); if (index === -1) return json(res, 404, { error: 'member_not_found' }); household.members.splice(index, 1); if (household.memberRoles) delete household.memberRoles[name]; household.version += 1; household.updatedAt = new Date().toISOString(); return json(res, 200, household); }
  if (url.pathname === '/api/sync' && req.method === 'POST') { household.sync = 'healthy'; household.version += 1; household.updatedAt = new Date().toISOString(); return json(res, 200, household); }
  if (url.pathname === '/api/reminders' && req.method === 'GET') return json(res, 200, reminders.all());
  if (url.pathname === '/api/reminders' && req.method === 'POST') { const key = req.headers['idempotency-key']; if (key && idempotentReminders.has(key)) return json(res, 200, idempotentReminders.get(key)); let body = ''; for await (const chunk of req) body += chunk; try { const reminder = JSON.parse(body); if (!reminder.id || !reminder.kind || !reminder.dueAt) return json(res, 400, { error: 'invalid_reminder' }); const item = reminders.upsert(reminder); if (key) idempotentReminders.set(key, item); return json(res, 201, item); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  const reminderMatch = url.pathname.match(/^\/api\/reminders\/([^/]+)\/(dismiss|snooze)$/); if (reminderMatch && req.method === 'POST') { const value = reminderMatch[2] === 'dismiss' ? reminders.dismiss(reminderMatch[1]) : reminders.snooze(reminderMatch[1]); return value ? json(res, 200, value) : json(res, 404, { error: 'reminder_not_found' }); }
  if (url.pathname === '/api/capture' && req.method === 'POST') { const key = req.headers['idempotency-key']; if (key && idempotentCaptures.has(key)) return json(res, 200, idempotentCaptures.get(key)); let body = ''; for await (const chunk of req) body += chunk; try { const capture = JSON.parse(body); const parsed = parseCapture(capture.value); if (!parsed) return json(res, 400, { error: 'invalid_capture' }); const type = capture.type ?? parsed.type; const item = { id: `capture-${captures.length + 1}`, ...parsed, type, stored: 'local-demo' }; captures.push(item); if (type === 'Task') { const task = { id: `task-${randomUUID().slice(0, 8)}`, title: capture.value.trim(), owner: capture.owner ?? 'Unassigned', completed: false }; tasks.push(task); item.targetId = task.id; } if (type === 'List item') { const listItem = { id: nextListId(), title: capture.value.trim(), listName: 'Shopping', completed: false }; listNames.add('Shopping'); listItems.push(listItem); item.targetId = listItem.id; } if (type === 'Event') { const event = { providerId: `local-capture-${events.size + 1}`, title: capture.value.trim(), startsAt: capture.startsAt ?? new Date(Date.now() + 3600000).toISOString(), owner: capture.owner ?? 'Shared', recurrence: capture.recurrence ?? null }; events.set(event.providerId, event); item.targetId = event.providerId; } if (key) idempotentCaptures.set(key, item); return json(res, 201, item); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/tasks' && req.method === 'GET') { const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200)); return json(res, 200, tasks.slice(-limit).reverse()); }
  if (url.pathname === '/api/tasks' && req.method === 'POST') { const key = req.headers['idempotency-key']; if (key && idempotentTasks.has(key)) return json(res, 200, idempotentTasks.get(key)); let body = ''; for await (const chunk of req) body += chunk; try { const task = JSON.parse(body); if (!task.title?.trim()) return json(res, 400, { error: 'invalid_task' }); const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const recurrenceDays = Array.isArray(task.recurrenceDays) ? task.recurrenceDays.filter(day => validDays.includes(day)) : []; const item = { id: `task-${randomUUID().slice(0, 8)}`, title: task.title.trim(), owner: task.owner ?? 'Unassigned', recurrence: ['daily', 'weekly'].includes(task.recurrence) ? task.recurrence : null, recurrenceDays: recurrenceDays.length ? recurrenceDays : null, completed: false }; tasks.push(item); if (key) idempotentTasks.set(key, item); return json(res, 201, item); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  const taskResource = url.pathname.match(/^\/api\/tasks\/([^/]+)$/); if (taskResource && (req.method === 'PUT' || req.method === 'DELETE')) { const task = tasks.find(item => item.id === taskResource[1]); if (!task) return json(res, 404, { error: 'task_not_found' }); if (req.method === 'DELETE') { tasks.splice(tasks.indexOf(task), 1); return json(res, 200, { deleted: true, id: task.id }); } let body = ''; for await (const chunk of req) body += chunk; try { const update = JSON.parse(body); if (!update.title?.trim()) return json(res, 400, { error: 'invalid_task' }); task.title = update.title.trim(); task.owner = update.owner ?? task.owner; if (update.recurrence !== undefined) { const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; task.recurrence = ['daily', 'weekly'].includes(update.recurrence) ? update.recurrence : null; const recurrenceDays = Array.isArray(update.recurrenceDays) ? update.recurrenceDays.filter(day => validDays.includes(day)) : []; task.recurrenceDays = recurrenceDays.length ? recurrenceDays : null; } return json(res, 200, task); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(complete|undo)$/); if (taskMatch && req.method === 'POST') { const task = tasks.find(item => item.id === taskMatch[1]); if (!task) return json(res, 404, { error: 'task_not_found' }); task.completed = taskMatch[2] === 'complete'; return json(res, 200, task); }
  if (url.pathname === '/api/lists' && req.method === 'GET') return json(res, 200, [...listNames].map(name => ({ name })));
  if (url.pathname === '/api/lists' && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; try { const { name } = JSON.parse(body); if (!name?.trim()) return json(res, 400, { error: 'invalid_list' }); const normalized = name.trim(); listNames.add(normalized); return json(res, 201, { name: normalized }); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/lists/items' && req.method === 'GET') { const selected = url.searchParams.get('list'); const values = selected ? listItems.filter(item => listOf(item) === selected) : listItems; const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200)); return json(res, 200, values.slice(-limit).reverse()); }
  if (url.pathname === '/api/lists/items' && req.method === 'POST') { const key = req.headers['idempotency-key']; if (key && idempotentLists.has(key)) return json(res, 200, idempotentLists.get(key)); let body = ''; for await (const chunk of req) body += chunk; try { const item = JSON.parse(body); if (!item.title?.trim()) return json(res, 400, { error: 'invalid_list_item' }); const listName = item.listName?.trim() || 'Shared list'; listNames.add(listName); const created = { id: nextListId(), title: item.title.trim(), listName, completed: false }; listItems.push(created); if (key) idempotentLists.set(key, created); return json(res, 201, created); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  const listResource = url.pathname.match(/^\/api\/lists\/items\/([^/]+)$/); if (listResource && (req.method === 'PUT' || req.method === 'DELETE')) { const item = listItems.find(entry => entry.id === listResource[1]); if (!item) return json(res, 404, { error: 'list_item_not_found' }); if (req.method === 'DELETE') { listItems.splice(listItems.indexOf(item), 1); return json(res, 200, { deleted: true, id: item.id }); } let body = ''; for await (const chunk of req) body += chunk; try { const update = JSON.parse(body); if (!update.title?.trim()) return json(res, 400, { error: 'invalid_list_item' }); item.title = update.title.trim(); return json(res, 200, item); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  const listMove = url.pathname.match(/^\/api\/lists\/items\/([^/]+)\/move$/); if (listMove && req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; try { const { direction } = JSON.parse(body); if (!['up', 'down'].includes(direction)) return json(res, 400, { error: 'invalid_direction' }); const index = listItems.findIndex(entry => entry.id === listMove[1]); if (index < 0) return json(res, 404, { error: 'list_item_not_found' }); const same = listItems.map((entry, position) => listOf(entry) === listOf(listItems[index]) ? position : -1).filter(position => position >= 0); const target = same[same.indexOf(index) + (direction === 'up' ? -1 : 1)]; if (target !== undefined) [listItems[index], listItems[target]] = [listItems[target], listItems[index]]; return json(res, 200, listItems.find(entry => entry.id === listMove[1])); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/lists/items/clear-completed' && req.method === 'POST') { const scope = url.searchParams.get('list'); const cleared = listItems.filter(item => item.completed && (!scope || listOf(item) === scope)); bundle.lastClearedListItems = cleared.map(item => ({ ...item })); listItems.splice(0, listItems.length, ...listItems.filter(item => !cleared.includes(item))); return json(res, 200, { cleared: cleared.map(item => item.id), count: cleared.length }); }
  if (url.pathname === '/api/lists/items/restore-cleared' && req.method === 'POST') { const restored = bundle.lastClearedListItems; listItems.push(...restored.filter(item => !listItems.some(existing => existing.id === item.id))); bundle.lastClearedListItems = []; return json(res, 200, { restored: restored.map(item => item.id), count: restored.length }); }
  const listMatch = url.pathname.match(/^\/api\/lists\/items\/([^/]+)\/(check|reopen)$/); if (listMatch && req.method === 'POST') { const item = listItems.find(entry => entry.id === listMatch[1]); if (!item) return json(res, 404, { error: 'list_item_not_found' }); item.completed = listMatch[2] === 'check'; return json(res, 200, item); }
  const listNameMatch = url.pathname.match(/^\/api\/lists\/([^/]+)$/); if (listNameMatch && listNameMatch[1] !== 'items' && (req.method === 'PUT' || req.method === 'DELETE')) { const name = decodeURIComponent(listNameMatch[1]); if (!listNames.has(name) && !listItems.some(item => listOf(item) === name)) return json(res, 404, { error: 'list_not_found' }); if (req.method === 'DELETE') { const removed = listItems.filter(item => listOf(item) === name); listItems.splice(0, listItems.length, ...listItems.filter(item => !removed.includes(item))); listNames.delete(name); return json(res, 200, { deleted: true, name, count: removed.length }); } let body = ''; for await (const chunk of req) body += chunk; try { const next = JSON.parse(body).name?.trim(); if (!next) return json(res, 400, { error: 'invalid_list' }); if (next !== name && (listNames.has(next) || listItems.some(item => listOf(item) === next))) return json(res, 409, { error: 'list_exists' }); listItems.forEach(item => { if (listOf(item) === name) item.listName = next; }); const ordered = [...listNames].map(entry => entry === name ? next : entry); if (!ordered.includes(next)) ordered.push(next); listNames.clear(); ordered.forEach(entry => listNames.add(entry)); return json(res, 200, { name: next }); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/calendar/events' && req.method === 'GET') { const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? 1000) || 1000, 5000)); return json(res, 200, [...events.values()].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, limit).map(ownerMask(calendarConnections)).map(privacyMask(calendarConnections))); }
  if (url.pathname === '/api/calendar/events' && req.method === 'POST') { const key = req.headers['idempotency-key']; if (key && idempotentEvents.has(key)) return json(res, 200, idempotentEvents.get(key)); let body = ''; for await (const chunk of req) body += chunk; try { const event = JSON.parse(body); if (!event.title?.trim() || !event.startsAt) return json(res, 400, { error: 'invalid_event' }); const providerId = event.providerId ?? `local-${events.size + 1}`; const owners = Array.isArray(event.owners) ? event.owners.filter(Boolean) : (event.owner ? [event.owner] : ['Shared']); const item = { providerId, title: event.title.trim(), startsAt: event.startsAt, endsAt: event.endsAt ?? null, owner: owners[0], owners, recurrence: event.recurrence ?? null, allDay: Boolean(event.allDay), eventType: event.eventType ?? null, location: event.location?.trim() || null, recurrenceDays: null, description: null, reminderMinutes: null, ...eventExtras(event) }; events.set(providerId, item); if (key) idempotentEvents.set(key, item); return json(res, 201, item); } catch { return json(res, 400, { error: 'invalid_json' }); } }
  if (url.pathname === '/api/extras' && req.method === 'GET') return json(res, 200, bundle.extras);
  const extrasMatch = url.pathname.match(/^\/api\/extras\/([a-zA-Z]+)$/);
  if (extrasMatch && req.method === 'PUT') {
    const EXTRA_KEYS = ['settings', 'taskMeta', 'coins', 'treasures', 'recipes', 'mealPlan', 'listMeta', 'photoFrame', 'childLock', 'profiles', 'holidays', 'calendarMeta'];
    if (!EXTRA_KEYS.includes(extrasMatch[1])) return json(res, 404, { error: 'unknown_extra' });
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 6_000_000) return json(res, 413, { error: 'too_large' }); }
    try { bundle.extras[extrasMatch[1]] = JSON.parse(body); household.version += 1; household.updatedAt = new Date().toISOString(); return json(res, 200, bundle.extras[extrasMatch[1]]); } catch { return json(res, 400, { error: 'invalid_json' }); }
  }
  const eventMatch = url.pathname.match(/^\/api\/calendar\/events\/([^/]+)$/); if (eventMatch && (req.method === 'PUT' || req.method === 'DELETE')) { const providerId = eventMatch[1]; if (!events.has(providerId)) return json(res, 404, { error: 'event_not_found' }); if (req.method === 'DELETE') { events.delete(providerId); return json(res, 200, { deleted: true, providerId }); } let body = ''; for await (const chunk of req) body += chunk; try { const current = events.get(providerId); if (privacyMask(calendarConnections)(current).private) return json(res, 403, { error: 'event_private' }); const update = JSON.parse(body); if (!update.title?.trim() || !update.startsAt) return json(res, 400, { error: 'invalid_event' }); const owners = Array.isArray(update.owners) ? update.owners.filter(Boolean) : (update.owner ? [update.owner] : (current.owners ?? [current.owner])); const item = { ...current, title: update.title.trim(), startsAt: update.startsAt, endsAt: update.endsAt !== undefined ? update.endsAt : current.endsAt, owner: owners[0], owners, recurrence: update.recurrence ?? current.recurrence, allDay: update.allDay !== undefined ? Boolean(update.allDay) : current.allDay, eventType: update.eventType !== undefined ? update.eventType : current.eventType, location: update.location !== undefined ? (update.location?.trim() || null) : current.location, ...eventExtras(update) }; if (update.recurrence === undefined) item.recurrence = current.recurrence ?? null; events.set(providerId, item); return json(res, 200, item); } catch { return json(res, 400, { error: 'invalid_json' }); } }

  if (url.pathname === '/') { res.writeHead(302, { Location: '/app' }); return res.end(); } // the portal: / opens the app (which asks for the login first)
  const requested = url.pathname === '/app' ? '/index.html' : url.pathname === '/login' ? '/login.html' : url.pathname === '/join' ? '/join.html' : url.pathname === '/signup' ? '/signup.html' : url.pathname === '/styleguide' ? '/styleguide.html' : url.pathname === '/favicon.ico' ? '/assets/brand/favicon.ico' : url.pathname === '/apple-touch-icon.png' ? '/assets/brand/apple-touch-icon.png' : url.pathname;
  // Static files come from an allowlist only: public web assets in the root and /f/. Server code, state
  // files (/data), docs, tests and dependencies must never be reachable over HTTP.
  if (!isPublicAsset(requested)) { res.writeHead(404, securityHeaders); return res.end('Not found'); }
  const path = normalize(join(root, requested));
  if (!path.startsWith(root)) return json(res, 403, { error: 'forbidden' });
  try { let content = await readFile(path);  res.writeHead(200, { 'Content-Type': contentTypes[extname(path)] ?? 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(content); }
  catch { res.writeHead(404); res.end('Not found'); }
}

createServer((req, res) => {
  // Per-request scope: which household rows this request touched, and whether it can have changed anything.
  const path = (req.url ?? '').split('?')[0];
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method) || /^\/api\/(providers|auth)\//.test(path);
  requestScope.run({ households: new Set(), mutating }, () => handleRequest(req, res).catch(error => { console.error('[request failed]', error); if (!res.headersSent) { res.writeHead(500, securityHeaders); res.end('Internal error'); } else res.end(); }));
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log(`Dulli running at http://localhost:${process.env.PORT ?? 3000}`));
