// A revoked/expired Google authorisation is reported as "reauth_required" (not a generic failure) and can be reconnected.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../server/auth.mjs';

const tokenServer = createServer((req, res) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' })); });
await new Promise(resolve => tokenServer.listen(0, '127.0.0.1', resolve));
const dir = await mkdtemp(join(tmpdir(), 'jd-reauth-')); const stateFile = join(dir, 'state.json');
const accountId = randomUUID(); const connectionId = randomUUID();
const account = { id: accountId, email: 'a@test.example', passwordHash: await hashPassword('family-pass-1'), householdId: 'hh', tier: 'familie_plus', createdAt: new Date().toISOString() };
await writeFile(stateFile, JSON.stringify({ version: 2, sessionSecret: 'z'.repeat(64), accounts: [[accountId, account]], households: { hh: { household: { id: 'hh', members: [], version: 1 }, calendarConnections: [{ id: connectionId, provider: 'google', label: 'me@example.com', status: 'connected' }], providerTokens: [[connectionId, { accessToken: 'old', refreshToken: 'revoked', expiresAt: 0 }]], events: [[`${connectionId}-e1`, { providerId: `${connectionId}-e1`, title: 'Kept event', startsAt: '2030-01-01T10:00:00Z' }]] } } }));
const port = Number(process.env.REAUTH_PORT ?? 4481); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), STATE_FILE: stateFile, DATABASE_URL: '', GOOGLE_TOKEN_URL: `http://127.0.0.1:${tokenServer.address().port}`, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: `${base}/api/providers/google/callback` }, stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@test.example', password: 'family-pass-1' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const call = (path, method = 'GET', extra = {}) => fetch(`${base}${path}`, { method, headers: { Cookie: cookie }, redirect: 'manual', ...extra });
  const all = await (await call('/api/providers/sync-all', 'POST')).json();
  assert.deepEqual(all, [{ id: connectionId, error: 'reauth_required' }]);
  const single = await call(`/api/providers/connections/${connectionId}/sync`, 'POST'); assert.equal(single.status, 409); assert.equal((await single.json()).error, 'reauth_required');
  const connections = await (await call('/api/provider-connections')).json();
  assert.equal(connections.find(item => item.id === connectionId).status, 'reauth_required');
  assert.ok((await (await call('/api/calendar/events')).json()).some(event => event.title === 'Kept event'), 'stored events stay visible while access is expired');
  const reconnect = await call(`/api/providers/google/connect?connection=${connectionId}`);
  assert.equal(reconnect.status, 302); assert.match(reconnect.headers.get('location'), /accounts\.google\.com/);
  console.log('google-reauth: expired authorisation reported as reauth_required, events kept, reconnect starts OAuth passed');
} finally { server.kill(); tokenServer.close(); await rm(dir, { recursive: true, force: true }); }
