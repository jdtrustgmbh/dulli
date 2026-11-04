// PostgreSQL persistence smoke: import from a state file, one row per household, restart from the database only,
// invite/removal/deletion reflected in rows. Needs a scratch database: PG_TEST_URL=postgresql://user:pass@host:port/db
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../server/auth.mjs';

const url = process.env.PG_TEST_URL;
if (!url) { console.log('postgres-tenancy: skipped (set PG_TEST_URL)'); process.exit(0); }
const pool = new pg.Pool({ connectionString: url, max: 2 });
await pool.query('drop table if exists jd_accounts, jd_households, jd_meta, app_state');
const port = Number(process.env.PG_SMOKE_PORT ?? 4451); const base = `http://127.0.0.1:${port}`;
const dir = await mkdtemp(join(tmpdir(), 'jd-pg-')); const stateFile = join(dir, 'state.json');
const account = async (email, householdId) => ({ id: randomUUID(), email, passwordHash: await hashPassword('family-pass-1'), householdId, tier: 'familie', createdAt: new Date().toISOString() });
const a = await account('a@family-a.test', 'hh-a'); const b = await account('b@family-b.test', 'hh-b');
await writeFile(stateFile, JSON.stringify({ version: 2, sessionSecret: 'y'.repeat(64), accounts: [[a.id, a], [b.id, b]], households: { 'hh-a': { household: { id: 'hh-a', name: 'Familie A', members: ['Anna'], version: 1 } }, 'hh-b': { household: { id: 'hh-b', name: 'Familie B', members: ['Ben'], version: 1 } } } }));
let server;
const start = async env => { server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), DATABASE_URL: url, ...env }, stdio: 'ignore' }); for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); } throw new Error('server did not start'); };
const stop = async () => { server.kill(); await new Promise(r => setTimeout(r, 400)); };
const login = async (email, password = 'family-pass-1') => { const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); return r.ok ? r.headers.get('set-cookie').split(';')[0] : null; };
const call = (cookie, path, method = 'GET', body) => fetch(`${base}${path}`, { method, headers: { Cookie: cookie ?? '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
try {
  // 1) first start with a state file: imported into per-household rows
  await start({ STATE_FILE: stateFile });
  assert.equal((await call(null, '/api/health')).status, 200);
  const rowsAfterImport = (await pool.query('select id from jd_households order by id')).rows.map(row => row.id); assert.deepEqual(rowsAfterImport, ['hh-a', 'hh-b']);
  assert.equal((await pool.query('select count(*)::int as n from jd_accounts')).rows[0].n, 2);
  let cookieA = await login(a.email); const cookieB = await login(b.email); assert.ok(cookieA && cookieB);
  await call(cookieA, '/api/tasks', 'POST', { title: 'Task of family A', owner: 'Anna' });
  await call(cookieB, '/api/tasks', 'POST', { title: 'Task of family B', owner: 'Ben' });
  await call(cookieA, '/api/extras/recipes', 'PUT', { items: [{ id: 'a1', name: 'Rezept A' }] });
  // each household row holds only its own data
  const payloadOf = async id => JSON.stringify((await pool.query('select payload from jd_households where id = $1', [id])).rows[0].payload);
  const rowA = await payloadOf('hh-a'); const rowB = await payloadOf('hh-b');
  assert.ok(rowA.includes('Task of family A') && !rowA.includes('Task of family B') && !rowA.includes('Familie B'));
  assert.ok(rowB.includes('Task of family B') && !rowB.includes('Task of family A') && !rowB.includes('Rezept A'));
  // reads must not write
  const before = (await pool.query('select updated_at from jd_households where id = $1', ['hh-b'])).rows[0].updated_at.toISOString();
  await call(cookieB, '/api/tasks'); await call(cookieB, '/api/extras');
  assert.equal((await pool.query('select updated_at from jd_households where id = $1', ['hh-b'])).rows[0].updated_at.toISOString(), before, 'GET requests do not rewrite the household row');
  // invite + join persisted as an account row of the right household
  const invite = await (await call(cookieA, '/api/access/invites', 'POST', {})).json();
  const joined = await call(null, '/api/auth/join', 'POST', { code: invite.code, email: 'oma@family-a.test', password: 'password-123' }); assert.equal(joined.status, 201);
  assert.deepEqual((await pool.query(`select household_id, role from jd_accounts where email = 'oma@family-a.test'`)).rows, [{ household_id: 'hh-a', role: 'member' }]);
  await stop();

  // 2) restart WITHOUT the state file: everything comes from PostgreSQL
  await rm(stateFile);
  await start({ STATE_FILE: '' });
  cookieA = await login(a.email); assert.ok(cookieA, 'login works from database state (secret + accounts persisted)');
  assert.deepEqual((await (await call(cookieA, '/api/tasks')).json()).map(task => task.title), ['Task of family A']);
  assert.deepEqual((await (await call(await login(b.email), '/api/tasks')).json()).map(task => task.title), ['Task of family B']);
  assert.equal((await (await call(cookieA, '/api/access')).json()).accounts.length, 2);

  // 3) removal and deletion are reflected in the tables; the other family is untouched
  const member = (await (await call(cookieA, '/api/access')).json()).accounts.find(item => item.role === 'member');
  assert.equal((await call(cookieA, `/api/access/${member.id}`, 'DELETE')).status, 200);
  assert.equal((await pool.query(`select count(*)::int as n from jd_accounts where email = 'oma@family-a.test'`)).rows[0].n, 0);
  assert.equal((await call(cookieA, '/api/account', 'DELETE', { password: 'family-pass-1' })).status, 200);
  assert.deepEqual((await pool.query('select id from jd_households order by id')).rows.map(row => row.id), ['hh-b']);
  assert.deepEqual((await pool.query('select email from jd_accounts')).rows.map(row => row.email), ['b@family-b.test']);
  assert.ok((await payloadOf('hh-b')).includes('Task of family B'));
  console.log('postgres-tenancy: import, per-household rows, restart from database, removal and deletion passed');
} finally { server?.kill(); await pool.end(); await rm(dir, { recursive: true, force: true }); }
