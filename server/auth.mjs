import { randomBytes, createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'jd_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function createAuthStore({ getSessionSecret } = {}) {
  const accounts = new Map(); // accountId -> { id, email, passwordHash, householdId, tier }
  // Sessions are stateless signed tokens (accountId + expiry, HMAC-signed with a secret that is
  // itself persisted — see server.mjs), not a server-side session table. That means a login
  // survives a redeploy/restart: there is nothing in memory for the restart to lose.
  const secret = getSessionSecret ?? (() => { const fallback = randomBytes(32).toString('hex'); return () => fallback; })();
  const revoked = new Map(); // token -> its own expiresAt, so logout still works without a full session table

  function findAccountByEmail(email) {
    const normalized = email.trim().toLowerCase();
    return [...accounts.values()].find(account => account.email === normalized);
  }

  function sign(payload) { return createHmac('sha256', secret()).update(payload).digest('base64url'); }

  function createSession(accountId) {
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const payload = Buffer.from(JSON.stringify({ a: accountId, e: expiresAt, i: Date.now() })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  }

  function resolveSession(token) {
    if (!token || revoked.has(token)) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    let expected;
    try { expected = Buffer.from(sign(payload)); } catch { return null; }
    let given;
    try { given = Buffer.from(signature); } catch { return null; }
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    let data;
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
    if (!data.e || data.e < Date.now()) return null;
    const account = accounts.get(data.a) ?? null;
    if (account && (data.i ?? 0) < (account.sessionsValidFrom ?? 0)) return null; // signed out everywhere / password changed
    return account;
  }

  function destroySession(token) {
    if (!token) return;
    let expiresAt = Date.now();
    try { expiresAt = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')).e ?? expiresAt; } catch {}
    revoked.set(token, expiresAt);
    for (const [key, exp] of revoked) if (exp < Date.now()) revoked.delete(key);
  }

  function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index < 0) continue;
      out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return out;
  }

  function sessionCookieValue(req) {
    return parseCookies(req.headers.cookie)[SESSION_COOKIE];
  }

  function setSessionCookie(res, token) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`);
  }

  function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  }

  return { accounts, findAccountByEmail, createSession, resolveSession, destroySession, sessionCookieValue, setSessionCookie, clearSessionCookie };
}
