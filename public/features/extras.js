// Shared persisted household store: window.jdExtras.get(key, fallback) / set(key, value) / subscribe(key, fn).
// Backed by GET /api/extras and PUT /api/extras/:key (server whitelists the keys).
(() => {
  let data = {}; const listeners = new Map(); let ready;
  const notify = key => (listeners.get(key) ?? []).forEach(fn => { try { fn(data[key]); } catch { /* listener errors must not break the store */ } });
  const load = () => (ready = fetch('/api/extras').then(r => r.ok ? r.json() : {}).then(value => { data = value ?? {}; for (const key of Object.keys(data)) notify(key); }).catch(() => {}));
  window.jdExtras = {
    ready: () => ready,
    reload: load,
    get: (key, fallback) => (data[key] === undefined ? fallback : data[key]),
    async set(key, value) {
      data[key] = value; notify(key);
      const response = await fetch(`/api/extras/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }).catch(() => null);
      if (!response?.ok) window.dispatchEvent(new CustomEvent('jd-extras-error', { detail: key }));
      return value;
    },
    subscribe(key, fn) { listeners.set(key, [...(listeners.get(key) ?? []), fn]); return () => listeners.set(key, (listeners.get(key) ?? []).filter(item => item !== fn)); }
  };
  load();
})();
