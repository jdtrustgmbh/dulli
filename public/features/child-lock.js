// Child lock (Kindersicherung): 4-digit PIN protects editing in selected areas; viewing stays possible.
// Persisted in extras.childLock = { enabled, salt, hash, areas: [...], unlockMinutes } (never the PIN itself).
// Public API (other features rely on it):
//   window.jdLock.isLocked(area) -> bool
//   window.jdLock.guard(area, fn) -> runs fn synchronously when unlocked, otherwise asks for the PIN and
//     runs fn after a successful unlock. Call event.preventDefault() yourself before guard() if needed.
//   window.jdLock.locked -> bool (lock active and not temporarily unlocked)
//   window.jdLock.install() -> capture-phase guard for clicks on [data-lock-area="<area>"] elements.
(() => {
  const AREAS = ['settings', 'events', 'tasks', 'lists', 'meals', 'recipes'];
  const AREA_LABELS = { settings: 'Device settings', events: 'Events', tasks: 'Tasks', lists: 'Lists', meals: 'Meals', recipes: 'Recipes' };
  const UNTIL_KEY = 'jd-lock-until';
  const MAX_TRIES = 5; const COOLDOWN_MS = 30000;
  const config = () => window.jdExtras?.get('childLock', null) ?? {};
  const active = () => { const value = config(); return Boolean(value.enabled && value.hash && value.salt); };
  let unlockedUntil = 0; try { unlockedUntil = Number(sessionStorage.getItem(UNTIL_KEY)) || 0; } catch { /* private mode */ }
  let failures = 0; let cooldownUntil = 0;
  const unlocked = () => Date.now() < unlockedUntil;
  const setUnlockedUntil = value => { unlockedUntil = value; try { sessionStorage.setItem(UNTIL_KEY, String(value)); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent('jd-lock-change')); };
  const t = text => window.jdT?.(text) ?? text;

  // ---- hashing (crypto.subtle needs a secure context; plain-JS fallback for LAN http displays) ----
  const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  function sha256Fallback(message) {
    const bytes = new TextEncoder().encode(message);
    const K = []; const H = [];
    const frac = x => ((x - Math.floor(x)) * 0x100000000) >>> 0;
    for (let n = 2, found = 0; found < 64; n++) { let prime = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; } if (prime) { if (found < 8) H.push(frac(Math.sqrt(n))); K.push(frac(Math.cbrt(n))); found++; } }
    const length = bytes.length; const total = Math.ceil((length + 9) / 64) * 64; const data = new Uint8Array(total); data.set(bytes); data[length] = 0x80;
    const view = new DataView(data.buffer); view.setUint32(total - 4, length * 8); view.setUint32(total - 8, Math.floor(length / 0x20000000));
    const w = new Uint32Array(64); const rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < total; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) { const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3); const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) { const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0; const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
      [a, b, c, d, e, f, g, h].forEach((value, i) => { H[i] = (H[i] + value) >>> 0; });
    }
    return H.map(value => value.toString(16).padStart(8, '0')).join('');
  }
  async function hashPin(salt, pin) {
    const message = `${salt}:${pin}`;
    if (window.crypto?.subtle) { try { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))); } catch { /* fall through */ } }
    return sha256Fallback(message);
  }
  const newSalt = () => { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return hex(bytes); };

  // ---- keypad dialog ----
  let dialog;
  function buildDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'jd-pin-dialog';
    dialog.setAttribute('aria-labelledby', 'jd-pin-title');
    dialog.innerHTML = `<div class="jd-pin-box"><p class="eyebrow">Child lock</p><h2 id="jd-pin-title"></h2><p class="jd-pin-hint muted"></p>
      <div class="jd-pin-dots" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="jd-pin-msg" role="alert"></p>
      <div class="jd-pin-pad" role="group" aria-label="PIN keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-pin-key="${n}">${n}</button>`).join('')}<button type="button" data-pin-clear aria-label="Clear PIN">C</button><button type="button" data-pin-key="0">0</button><button type="button" data-pin-back aria-label="Delete last digit">⌫</button></div>
      <button type="button" class="jd-btn" data-pin-cancel>Cancel</button></div>`;
    document.body.append(dialog);
    return dialog;
  }
  let current = null; // { resolve, check, value }
  function render() {
    if (!dialog || !current) return;
    dialog.querySelectorAll('.jd-pin-dots span').forEach((dot, index) => dot.classList.toggle('filled', index < current.value.length));
    const cooling = Date.now() < cooldownUntil;
    dialog.querySelectorAll('.jd-pin-pad button').forEach(button => { button.disabled = cooling || current.busy; });
  }
  let cooldownTimer;
  function showCooldown() {
    clearInterval(cooldownTimer);
    const tick = () => {
      const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (left <= 0) { clearInterval(cooldownTimer); if (current) { dialog.querySelector('.jd-pin-msg').textContent = ''; render(); } return; }
      dialog.querySelector('.jd-pin-msg').textContent = `${t('Too many attempts. Try again in')} ${left} s`;
      render();
    };
    tick(); cooldownTimer = setInterval(tick, 500);
  }
  async function press(key) {
    if (!current || current.busy || Date.now() < cooldownUntil) return;
    if (key === 'clear') current.value = '';
    else if (key === 'back') current.value = current.value.slice(0, -1);
    else if (current.value.length < 4) current.value += key;
    dialog.querySelector('.jd-pin-msg').textContent = '';
    render();
    if (current.value.length < 4) return;
    current.busy = true; render();
    const result = await current.check(current.value);
    if (!current) return;
    current.busy = false;
    if (result === true) { const done = current; current = null; dialog.close(); done.resolve(done.value); return; }
    dialog.querySelector('.jd-pin-box').classList.remove('shake'); void dialog.offsetWidth; dialog.querySelector('.jd-pin-box').classList.add('shake');
    current.value = ''; render();
    if (Date.now() < cooldownUntil) showCooldown(); else dialog.querySelector('.jd-pin-msg').textContent = result;
  }
  function pinPrompt({ title, hint = '', check = async () => true }) {
    if (!dialog) buildDialog();
    if (current) { current.resolve(null); current = null; }
    return new Promise(resolve => {
      current = { resolve, check, value: '', busy: false };
      dialog.querySelector('#jd-pin-title').textContent = t(title);
      dialog.querySelector('.jd-pin-hint').textContent = hint ? t(hint) : '';
      dialog.querySelector('.jd-pin-msg').textContent = '';
      render();
      if (!dialog.open) dialog.showModal();
      if (Date.now() < cooldownUntil) showCooldown();
      dialog.querySelector('[data-pin-key="1"]')?.focus();
      window.jdTranslate?.();
    });
  }
  document.addEventListener('click', event => {
    if (!dialog || !event.target.closest?.('.jd-pin-dialog')) return;
    const key = event.target.closest('[data-pin-key]'); if (key) return press(key.dataset.pinKey);
    if (event.target.closest('[data-pin-clear]')) return press('clear');
    if (event.target.closest('[data-pin-back]')) return press('back');
    if (event.target.closest('[data-pin-cancel]')) dialog.close();
  });
  document.addEventListener('keydown', event => {
    if (!dialog?.open || !current) return;
    if (/^[0-9]$/.test(event.key)) { event.preventDefault(); press(event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); press('back'); }
  });
  document.addEventListener('close', event => { if (event.target === dialog && current && !dialog.open) { const done = current; current = null; done.resolve(null); } }, true);

  async function verifyPin(pin) {
    if (Date.now() < cooldownUntil) return t('Too many attempts. Try again in') + ` ${Math.ceil((cooldownUntil - Date.now()) / 1000)} s`;
    const value = config();
    if (await hashPin(value.salt, pin) === value.hash) { failures = 0; return true; }
    failures += 1;
    if (failures >= MAX_TRIES) { failures = 0; cooldownUntil = Date.now() + COOLDOWN_MS; return t('Too many attempts. Try again in') + ' 30 s'; }
    return `${t('Wrong PIN.')} ${MAX_TRIES - failures} ${t('tries left')}`;
  }
  // Ask for the PIN without starting an unlock window (used for disabling / changing the lock).
  const confirmPin = (title = 'Enter PIN') => pinPrompt({ title, check: verifyPin }).then(pin => pin !== null);
  async function unlock() {
    if (!active() || unlocked()) return true;
    const ok = await confirmPin('Enter PIN to make changes');
    if (ok) setUnlockedUntil(Date.now() + (Number(config().unlockMinutes) || 5) * 60000);
    return ok;
  }
  async function choosePin() {
    const first = await pinPrompt({ title: 'Choose a 4-digit PIN', hint: 'The PIN is stored only as a salted hash.' });
    if (first === null) return null;
    const second = await pinPrompt({ title: 'Repeat the PIN', check: async pin => pin === first || t('PINs do not match. Try again.') });
    return second === null ? null : first;
  }
  const save = patch => window.jdExtras.set('childLock', { areas: ['events', 'tasks'], unlockMinutes: 5, ...config(), ...patch });
  async function setPin(pin) { const salt = newSalt(); return save({ salt, hash: await hashPin(salt, pin) }); }

  const isLocked = area => active() && (config().areas ?? []).includes(area) && !unlocked();
  function guard(area, fn) {
    if (!isLocked(area)) return fn?.();
    return unlock().then(ok => (ok ? fn?.() : undefined));
  }

  // ---- declarative protection of existing UIs ----
  // Existing screens are protected without editing them: known create/edit/delete controls get data-lock-area.
  const TARGETS = [
    ['events', '.week-add, .week-quick-add [type="submit"], [data-detail-delete], [data-detail-edit], [data-calendar-edit], [data-calendar-delete], .calendar-form [type="submit"]'],
    ['tasks', '[data-routine-edit], [data-routine-delete], .routine-add-slot > button, .routine-form [type="submit"]'],
    ['lists', '.list-fast-entry [type="submit"], .list-fast-entry .new-list'],
    ['meals', '.meal-form [type="submit"]'],
    ['settings', '.member-form [type="submit"], [data-remove-member]']
  ];
  const CAPTURE_AREAS = { Task: 'tasks', Event: 'events', 'List item': 'lists' };
  const markTargets = () => {
    for (const [area, selector] of TARGETS) document.querySelectorAll(selector).forEach(el => { if (!el.dataset.lockArea) el.dataset.lockArea = area; });
    const captureSubmit = document.querySelector('#capture-form [type="submit"]');
    if (captureSubmit) captureSubmit.dataset.lockArea = CAPTURE_AREAS[document.querySelector('#capture-form .type.active')?.dataset.type] ?? 'tasks';
  };
  let installed = false;
  function install() {
    if (installed) return; installed = true;
    window.addEventListener('click', event => {
      if (event.target.closest?.('#capture-form .type')) setTimeout(markTargets, 0);
      const el = event.target.closest?.('[data-lock-area]');
      if (!el) return;
      if (el.id === 'capture-form' || el.closest('#capture-form')) markTargets();
      const area = el.dataset.lockArea;
      if (!isLocked(area)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const target = event.target.closest('button, a, input, select, [role="button"]') ?? el;
      unlock().then(ok => { if (ok && target.isConnected) target.click(); });
    }, true);
    window.addEventListener('submit', event => {
      const form = event.target; const area = form?.dataset?.lockArea;
      if (!area || !isLocked(area)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      unlock().then(ok => { if (ok && form.isConnected) form.requestSubmit(); });
    }, true);
    window.__jdRegisterEnhancer ? window.__jdRegisterEnhancer(markTargets) : markTargets();
  }

  // ---- settings section (rendered inside the Settings panel by public/features/settings.js) ----
  const fmtTime = ms => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  function renderSettings(host) {
    const value = config(); const on = active();
    const areas = value.areas ?? ['events', 'tasks'];
    host.innerHTML = `<label class="jd-switch"><span><strong>Child lock active</strong><small class="muted">Viewing stays possible; changes need the PIN.</small></span><input type="checkbox" role="switch" data-lock-toggle ${on ? 'checked' : ''}></label>
      ${on ? `<p class="jd-lock-status ${unlocked() ? 'open' : ''}">${unlocked() ? `🔓 <span>Unlocked until</span> ${fmtTime(unlockedUntil)}` : '🔒 <span>Locked</span>'}</p>
      <div class="jd-lock-actions">${unlocked() ? '<button type="button" class="jd-btn" data-lock-now>Lock now</button>' : '<button type="button" class="jd-btn" data-lock-unlock>Unlock</button>'}<button type="button" class="jd-btn" data-lock-pin>Change PIN</button></div>
      <label class="jd-field">Unlock duration<select data-lock-minutes>${[1, 5, 15, 30].map(n => `<option value="${n}" ${Number(value.unlockMinutes ?? 5) === n ? 'selected' : ''}>${n} min</option>`).join('')}</select></label>
      <fieldset class="jd-lock-areas"><legend>Protected areas</legend>${AREAS.map(area => `<label><input type="checkbox" data-lock-area-option="${area}" ${areas.includes(area) ? 'checked' : ''}> <span>${AREA_LABELS[area]}</span></label>`).join('')}</fieldset>` : ''}`;
    const rerender = () => { renderSettings(host); window.jdTranslate?.(); };
    // Changes to an active lock require the PIN (or a current unlock window).
    const whenUnlocked = async fn => { if (await unlock()) await fn(); rerender(); };
    host.querySelector('[data-lock-toggle]').addEventListener('change', async event => {
      event.target.checked = on; // revert until the flow finishes
      if (!on) {
        if (config().hash && config().salt) { await save({ enabled: true }); }
        else { const pin = await choosePin(); if (pin) { await setPin(pin); await save({ enabled: true }); } }
        if (active()) setUnlockedUntil(0);
      } else if (await confirmPin('Enter PIN to turn off the child lock')) { await save({ enabled: false }); setUnlockedUntil(0); }
      rerender();
    });
    host.querySelector('[data-lock-now]')?.addEventListener('click', () => { setUnlockedUntil(0); rerender(); });
    host.querySelector('[data-lock-unlock]')?.addEventListener('click', async () => { await unlock(); rerender(); });
    host.querySelector('[data-lock-pin]')?.addEventListener('click', async () => {
      if (!(await confirmPin('Enter current PIN'))) return rerender();
      const pin = await choosePin(); if (pin) await setPin(pin); rerender();
    });
    host.querySelector('[data-lock-minutes]')?.addEventListener('change', event => { const minutes = Number(event.target.value); event.target.value = String(config().unlockMinutes ?? 5); whenUnlocked(() => save({ unlockMinutes: minutes })); });
    host.querySelectorAll('[data-lock-area-option]').forEach(box => box.addEventListener('change', () => {
      const area = box.dataset.lockAreaOption; const checked = box.checked; box.checked = !checked;
      whenUnlocked(() => { const next = new Set(config().areas ?? []); if (checked) next.add(area); else next.delete(area); return save({ areas: AREAS.filter(item => next.has(item)) }); });
    }));
  }

  const extend = (dict, tries = 0) => { if (window.jdI18nExtend) window.jdI18nExtend(dict); else if (tries < 100) setTimeout(() => extend(dict, tries + 1), 100); };
  extend({
    'Child lock': 'Kindersicherung', 'Child lock active': 'Kindersicherung aktiv', 'Viewing stays possible; changes need the PIN.': 'Ansehen bleibt möglich; Änderungen brauchen die PIN.',
    'Unlocked until': 'Entsperrt bis', 'Locked': 'Gesperrt', 'Lock now': 'Jetzt sperren', 'Unlock': 'Entsperren', 'Change PIN': 'PIN ändern',
    'Unlock duration': 'Entsperrdauer', 'Protected areas': 'Geschützte Bereiche', 'Device settings': 'Geräte-Einstellungen',
    'Enter PIN to make changes': 'PIN eingeben, um Änderungen vorzunehmen', 'Enter PIN to turn off the child lock': 'PIN eingeben, um die Kindersicherung auszuschalten',
    'Enter current PIN': 'Aktuelle PIN eingeben', 'Enter PIN': 'PIN eingeben', 'Choose a 4-digit PIN': 'Vierstellige PIN wählen', 'Repeat the PIN': 'PIN wiederholen',
    'The PIN is stored only as a salted hash.': 'Die PIN wird nur als gesalzener Hash gespeichert.', 'PINs do not match. Try again.': 'PINs stimmen nicht überein. Bitte erneut.',
    'Wrong PIN.': 'Falsche PIN.', 'tries left': 'Versuche übrig', 'Too many attempts. Try again in': 'Zu viele Versuche. Erneut in', 'PIN keypad': 'PIN-Tastenfeld',
    'Clear PIN': 'PIN löschen', 'Delete last digit': 'Letzte Ziffer löschen'
  });

  window.jdLock = {
    AREAS, AREA_LABELS, isLocked, guard, unlock, install, renderSettings,
    lock: () => setUnlockedUntil(0),
    get locked() { return active() && !unlocked(); },
    get enabled() { return active(); },
    get unlockedUntil() { return unlocked() ? unlockedUntil : 0; }
  };
  window.jdExtras?.subscribe('childLock', () => window.dispatchEvent(new CustomEvent('jd-lock-change')));
  install();
})();
