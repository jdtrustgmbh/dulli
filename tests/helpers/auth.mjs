export async function loginCookie(baseUrl, email = 'test@example.com', password = 'test-password-123') {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error(`login failed: ${response.status} ${await response.text()}`);
  return setCookie.split(';')[0];
}

export async function loginBrowserContext(context, baseUrl, email = 'test@example.com', password = 'test-password-123') {
  const cookie = await loginCookie(baseUrl, email, password);
  const [, value] = cookie.split('=');
  const url = new URL(baseUrl);
  await context.addCookies([{ name: 'jd_session', value, domain: url.hostname, path: '/', httpOnly: true }]);
}
