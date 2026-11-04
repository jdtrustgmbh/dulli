// Multi-tenant isolation + access management smoke: two families, invites, member removal, sign-out-everywhere, account deletion.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../server/auth.mjs';

const port = Number(process.env.ACCESS_SMOKE_PORT ?? 4441);
const base = `http://127.0.0.1:${port}`;
const dir = await mkdtemp(join(tmpdir(), 'jd-access-'));
const stateFile = join(dir, 'state.json');
const account = async (email, householdId, extra = {}) => ({ id: randomUUID(), email, passwordHash: await hashPassword('family-pass-1'), householdId, tier: 'familie', createdAt: new Date().toISOString(), ...extra });
const accountA = await account('a@family-a.test', 'hh-a'); const accountB = await account('b@family-b.test', 'hh-b');
await writeFile(stateFile, JSON.stringify({ version: 2, sessionSecret: 'x'.repeat(64), accounts: [[accountA.id, accountA], [accountB.id, accountB]], households: { 'hh-a': { household: { id: 'hh-a', name: 'Familie A', members: ['Anna'], version: 1 } }, 'hh-b': { household: { id: 'hh-b', name: 'Familie B', members: ['Ben'], version: 1 } } } }));
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), STATE_FILE: stateFile, DATABASE_URL: '' }, stdio: 'ignore' });
try {
  for (let attempt = 0; attempt < 50; attempt++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise(resolve => setTimeout(resolve, 100)); }
  const login = async (email, password = 'family-pass-1') => { const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); return response.ok ? response.headers.get('set-cookie').split(';')[0] : null; };
  const call = (cookie, path, method = 'GET', body) => fetch(`${base}${path}`, { method, headers: { Cookie: cookie ?? '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const cookieA = await login('a@family-a.test'); const cookieB = await login('b@family-b.test');
  assert.ok(cookieA && cookieB);

  // --- data separation: each family writes data and only ever sees its own ---
  await call(cookieA, '/api/tasks', 'POST', { title: 'Task of family A', owner: 'Anna' });
  await call(cookieB, '/api/tasks', 'POST', { title: 'Task of family B', owner: 'Ben' });
  await call(cookieA, '/api/extras/recipes', 'PUT', { items: [{ id: 'a1', name: 'Rezept A' }] });
  await call(cookieB, '/api/extras/recipes', 'PUT', { items: [{ id: 'b1', name: 'Rezept B' }] });
  const titles = async cookie => (await (await call(cookie, '/api/tasks')).json()).map(task => task.title);
  assert.deepEqual(await titles(cookieA), ['Task of family A']); assert.deepEqual(await titles(cookieB), ['Task of family B']);
  assert.equal((await (await call(cookieA, '/api/extras')).json()).recipes.items[0].name, 'Rezept A');
  assert.equal((await (await call(cookieB, '/api/household/demo')).json()).name, 'Familie B');
  const accessA = await (await call(cookieA, '/api/access')).json();
  assert.deepEqual(accessA.accounts.map(item => item.email), ['a@family-a.test']); assert.equal(accessA.role, 'owner');
  assert.equal((await call(cookieA, `/api/access/${accountB.id}`, 'DELETE')).status, 404, 'cannot touch another family\'s account');
  assert.equal((await call(cookieA, `/api/access/${accountA.id}`, 'DELETE')).status, 400, 'owner cannot remove self');
  assert.equal((await call(cookieA, '/api/access')).status, 200); assert.equal((await call(null, '/api/access')).status, 401);

  // --- invite a member into family A ---
  const invite = await (await call(cookieA, '/api/access/invites', 'POST', { email: 'oma@family-a.test' })).json();
  assert.match(invite.joinUrl, /\/join\?code=/);
  assert.equal((await call(null, '/api/auth/join', 'POST', { code: 'wrong', email: 'x@y.test', password: 'password-123' })).status, 400);
  assert.equal((await call(null, '/api/auth/join', 'POST', { code: invite.code, email: 'other@family-a.test', password: 'password-123' })).status, 400, 'invite bound to its e-mail');
  assert.equal((await call(null, '/api/auth/join', 'POST', { code: invite.code, email: 'b@family-b.test', password: 'password-123' })).status, 400);
  assert.equal((await call(null, '/api/auth/join', 'POST', { code: invite.code, email: 'oma@family-a.test', password: 'short' })).status, 400);
  const joined = await call(null, '/api/auth/join', 'POST', { code: invite.code, email: 'oma@family-a.test', password: 'password-123' });
  assert.equal(joined.status, 201); const cookieM = joined.headers.get('set-cookie').split(';')[0];
  assert.equal((await call(null, '/api/auth/join', 'POST', { code: invite.code, email: 'oma2@family-a.test', password: 'password-123' })).status, 400, 'invite is single use');
  assert.deepEqual(await titles(cookieM), ['Task of family A'], 'member sees the household of the inviter, never another');
  assert.equal((await (await call(cookieM, '/api/access')).json()).role, 'member');
  assert.equal((await call(cookieM, '/api/access/invites', 'POST', {})).status, 403);
  assert.equal((await call(cookieM, '/api/household/demo', 'DELETE')).status, 403, 'members cannot wipe the household');
  assert.equal((await (await call(cookieA, '/api/access')).json()).accounts.length, 2);
  assert.equal((await (await call(cookieB, '/api/access')).json()).accounts.length, 1, 'family B does not see family A members');

  // --- owner with members cannot delete; removal ends the member's access immediately ---
  assert.equal((await call(cookieA, '/api/account', 'DELETE', { password: 'family-pass-1' })).status, 409);
  const memberId = (await (await call(cookieA, '/api/access')).json()).accounts.find(item => item.role === 'member').id;
  assert.equal((await call(cookieM, `/api/access/${memberId}`, 'DELETE')).status, 403);
  assert.equal((await call(cookieA, `/api/access/${memberId}`, 'DELETE')).status, 200);
  assert.equal((await call(cookieM, '/api/tasks')).status, 401, 'removed member session stops working');
  assert.equal(await login('oma@family-a.test', 'password-123'), null, 'removed member cannot sign in');

  // --- sign out everywhere keeps only the calling session ---
  const secondA = await login('a@family-a.test');
  const logoutAll = await call(cookieA, '/api/auth/logout-all', 'POST'); assert.equal(logoutAll.status, 200);
  const freshA = logoutAll.headers.get('set-cookie').split(';')[0];
  assert.equal((await call(secondA, '/api/tasks')).status, 401, 'other devices are signed out');
  assert.equal((await call(cookieA, '/api/tasks')).status, 401, 'the old cookie of this device is replaced');
  assert.equal((await call(freshA, '/api/tasks')).status, 200);

  // --- account deletion: password required, removes household data, leaves other families untouched ---
  assert.equal((await call(freshA, '/api/account', 'DELETE', { password: 'nope' })).status, 403);
  const deleted = await call(freshA, '/api/account', 'DELETE', { password: 'family-pass-1' });
  assert.equal(deleted.status, 200); assert.equal((await deleted.json()).householdDeleted, true);
  assert.equal((await call(freshA, '/api/tasks')).status, 401); assert.equal(await login('a@family-a.test'), null);
  assert.deepEqual(await titles(cookieB), ['Task of family B'], 'family B is unaffected');
  assert.equal((await (await call(cookieB, '/api/extras')).json()).recipes.items[0].name, 'Rezept B');
  const persisted = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(persisted.households['hh-a'], undefined, 'household data is removed from persisted state'); assert.ok(persisted.households['hh-b']);
  assert.equal(persisted.accounts.some(([, item]) => item.email === 'a@family-a.test'), false);
  console.log('access: tenant isolation, invites, member removal, sign-out-everywhere, account deletion passed');
} finally { server.kill(); await rm(dir, { recursive: true, force: true }); }
