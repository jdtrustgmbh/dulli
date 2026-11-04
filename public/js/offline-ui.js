(() => {
  const QUEUE_KEY = 'jd-offline-queue';
  const CACHE_KEY = 'jd-offline-cache';
  const originalFetch = window.fetch.bind(window);
  const de = () => (localStorage.getItem('jd-language') || (navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en')) === 'de';

  const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback; } catch { return fallback; } };
  const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const getQueue = () => readJson(QUEUE_KEY, []);
  const setQueue = queue => writeJson(QUEUE_KEY, queue);
  const getCache = () => readJson(CACHE_KEY, {});
  const setCache = cache => writeJson(CACHE_KEY, cache);

  const headersToObject = headers => {
    const out = {};
    if (!headers) return out;
    if (headers instanceof Headers) { for (const [key, value] of headers.entries()) out[key] = value; return out; }
    for (const [key, value] of Object.entries(headers)) out[key] = value;
    return out;
  };

  const shouldSkipQueue = url => url.startsWith('/api/auth/') || url.startsWith('/api/stream');

  function cacheKeyFor(url) { const parsed = new URL(url, location.origin); return parsed.pathname + parsed.search; }

  function enqueue(url, method, headers, body) {
    const queue = getQueue();
    const idempotencyKey = headers['Idempotency-Key'] || headers['idempotency-key'] || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    queue.push({ url, method, headers, body: body ?? null, idempotencyKey, queuedAt: Date.now() });
    setQueue(queue);
    updateBanner();
  }

  function synthesizeResponse(method, body) {
    let parsed = {};
    try { parsed = body ? JSON.parse(body) : {}; } catch {}
    if (!parsed.id && !parsed.providerId) parsed.id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    parsed.queued = true;
    return new Response(JSON.stringify(parsed), { status: method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  }

  async function offlineFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return originalFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();

    if (method === 'GET') {
      if (navigator.onLine) {
        try {
          const response = await originalFetch(input, init);
          if (response.ok) { const cache = getCache(); cache[cacheKeyFor(url)] = { body: await response.clone().text(), at: Date.now() }; setCache(cache); }
          return response;
        } catch (error) {
          const cached = getCache()[cacheKeyFor(url)];
          if (cached) return new Response(cached.body, { status: 200, headers: { 'Content-Type': 'application/json' } });
          throw error;
        }
      }
      const cached = getCache()[cacheKeyFor(url)];
      if (cached) return new Response(cached.body, { status: 200, headers: { 'Content-Type': 'application/json' } });
      return originalFetch(input, init).catch(error => { throw error; });
    }

    if (shouldSkipQueue(url)) return originalFetch(input, init);

    const headers = headersToObject(init.headers);
    if (!navigator.onLine) { enqueue(url, method, headers, init.body); return synthesizeResponse(method, init.body); }
    try {
      return await originalFetch(input, init);
    } catch (error) {
      enqueue(url, method, headers, init.body);
      return synthesizeResponse(method, init.body);
    }
  }

  let flushing = false;
  async function flushQueue() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    const queue = getQueue();
    const remaining = [];
    let synced = 0;
    for (const entry of queue) {
      try {
        const headers = { ...entry.headers, 'Idempotency-Key': entry.headers['Idempotency-Key'] || entry.headers['idempotency-key'] || entry.idempotencyKey };
        const response = await originalFetch(entry.url, { method: entry.method, headers, body: entry.body });
        if (response.ok) synced++;
        else if (response.status >= 500) remaining.push(entry); // transient server error, retry later
        // 4xx: the request itself is invalid now (e.g. item already deleted) — drop it rather than retry forever
      } catch {
        remaining.push(entry);
        break; // still offline (or just dropped again) — stop, preserve remaining order for next attempt
      }
    }
    setQueue(remaining);
    flushing = false;
    updateBanner();
    if (synced > 0) {
      const live = document.querySelector('#live-region');
      if (live) live.textContent = de() ? `${synced} Änderung${synced === 1 ? '' : 'en'} synchronisiert` : `${synced} change${synced === 1 ? '' : 's'} synced`;
      window.loadSharedData?.();
      window.renderAvatars?.();
      window.updateAttentionBanner?.();
      document.dispatchEvent(new CustomEvent('jd-offline-synced'));
    }
  }

  let banner;
  function updateBanner() {
    if (!banner) {
      const actions = document.querySelector('.welcome-actions');
      if (!actions) return;
      banner = document.createElement('span');
      banner.id = 'offline-banner';
      banner.className = 'attention-banner';
      banner.hidden = true;
      actions.append(banner);
      banner.addEventListener('click', event => { if (event.target.closest('[data-offline-flush]')) flushQueue(); });
    }
    const count = getQueue().length;
    if (!navigator.onLine) {
      banner.hidden = false;
      banner.innerHTML = de() ? `Offline${count ? ` · ${count} Änderung${count === 1 ? '' : 'en'} wartet` : ''}` : `Offline${count ? ` · ${count} change${count === 1 ? '' : 's'} pending` : ''}`;
    } else if (count > 0) {
      banner.hidden = false;
      const label = de() ? `${count} Änderung${count === 1 ? '' : 'en'} werden synchronisiert` : `${count} change${count === 1 ? '' : 's'} syncing`;
      banner.innerHTML = `${label} <button type="button" class="banner-action" data-offline-flush>${de() ? 'Jetzt' : 'Now'}</button>`;
    } else {
      banner.hidden = true;
      banner.innerHTML = '';
    }
  }

  window.fetch = offlineFetch;
  window.jdOfflineQueueLength = () => getQueue().length;
  window.addEventListener('online', () => { updateBanner(); flushQueue(); });
  window.addEventListener('offline', updateBanner);
  setInterval(() => { if (navigator.onLine) flushQueue(); else updateBanner(); }, 20000);
  const start = () => { updateBanner(); if (navigator.onLine) flushQueue(); };
  window.__jdRegisterEnhancer ? window.__jdRegisterEnhancer(start) : (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start());
})();
