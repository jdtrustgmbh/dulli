// Small page enhancements that used to be separate scripts: date label, live updates, list offline queue,
// usage events, capture draft and the Today owner filter. Each block is self-contained.

// ===== ui-fixes.js =====
(() => {
  const date = document.querySelector('.welcome .eyebrow');
  if (date) date.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
})();

// ===== telemetry-ui.js =====
(() => {
  const key = 'jd-planning-telemetry';
  const allowed = new Set(['today_viewed', 'quick_capture_opened', 'quick_capture_completed', 'core_action']);
  const record = event => { if (!allowed.has(event)) return; const current = JSON.parse(localStorage.getItem(key) || '[]'); current.push({ event, at: new Date().toISOString() }); localStorage.setItem(key, JSON.stringify(current.slice(-100))); };
  record('today_viewed');
  document.addEventListener('click', event => { const target = event.target.closest('[data-open-capture], .module-action'); if (!target) return; if (target.matches('[data-open-capture]')) record('quick_capture_opened'); else record('core_action'); }, true);
  document.querySelector('#capture-form')?.addEventListener('submit', () => record('quick_capture_completed'));
})();

// ===== capture-draft.js =====
(() => {
  const form = document.querySelector('#capture-form');
  const input = document.querySelector('#capture-input');
  if (!form || !input) return;
  const key = 'jd-planning-capture-draft';
  const saved = localStorage.getItem(key);
  if (saved) input.value = saved;
  input.addEventListener('input', () => input.value.trim() ? localStorage.setItem(key, input.value) : localStorage.removeItem(key));
  form.addEventListener('submit', () => localStorage.removeItem(key));
})();

// ===== member-filter-ui.js =====
(() => {
  const enhance = async () => {
    const filter = document.querySelector('.today-owner-filter');
    if (!filter || filter.dataset.membersLoaded) return;
    filter.dataset.membersLoaded = 'true';
    try {
      const household = await (await fetch('/api/household/demo')).json();
      for (const name of household.members ?? []) if (!Array.from(filter.options).some(option => option.value === name)) filter.append(new Option(name, name));
    } catch { /* the built-in fallback options remain usable */ }
  };
  window.__jdRegisterEnhancer(enhance);
})();

// ===== realtime-ui.js =====
(() => {
  if (!('EventSource' in window)) return;
  const stream = new EventSource('/api/stream');
  stream.addEventListener('household-update', () => { const live = document.querySelector('#live-region'); if (live && !live.textContent) live.textContent = 'Shared household data updated'; });
  stream.onerror = () => { const live = document.querySelector('#live-region'); if (live) live.textContent = 'Live updates unavailable; refresh when connected'; };
})();

// ===== lists-ui.js =====
// Offline queue for list items. The Lists tab UI itself lives in /f/lists-plus.js (window.jdListsPlus).
(() => {
  const queueKey = 'jd-list-queue';
  const read = () => { try { return JSON.parse(localStorage.getItem(queueKey) || '[]'); } catch { return []; } };
  const retryQueue = async () => { const queued = read(); const remaining = []; for (const item of queued) { try { const response = await fetch('/api/lists/items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `offline-list-${item.createdAt}` }, body: JSON.stringify(item) }); if (!response.ok) throw new Error(); } catch { remaining.push(item); } } localStorage.setItem(queueKey, JSON.stringify(remaining)); if (queued.length && !remaining.length) { document.querySelector('#live-region').textContent = 'Offline list items synced'; window.dispatchEvent(new CustomEvent('jd-lists-changed')); } };
  window.jdListQueue = { push: item => { const queued = read(); queued.push({ ...item, createdAt: Date.now() }); localStorage.setItem(queueKey, JSON.stringify(queued)); }, pending: listName => read().filter(item => !listName || item.listName === listName), retry: retryQueue };
  window.addEventListener('online', retryQueue);
})();
