// treasures: per-profile coin balance, Bronze/Silver/Gold chests, custom treasures, history with undo, manual adjustments.
// Replaces the old Rewards panel (More > Rewards tool). /api/rewards endpoints stay untouched for compatibility.
// Data: extras.treasures {prices:{member:{bronze,silver,gold}}, custom:[{id,member,name,emoji,price,repeatable}], history:[{id,member,kind,key,name,emoji,price,at,undoneAt}]}
//       extras.coins ledger [{id,member,delta,reason,taskId?,historyId?,date,at,label}] (shared with public/features/tasks-plus.js)
(() => {
  const X = () => window.jdExtras;
  const DE = {};
  const T = key => (window.jdLanguage?.() === 'en' ? key : (DE[key] ?? key));
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const say = message => { const el = document.querySelector('#live-region'); if (el) el.textContent = message; };
  const guard = (area, fn) => (window.jdLock?.guard ? window.jdLock.guard(area, fn) : fn());
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const CHESTS = [{ key: 'bronze', label: 'Bronze chest', price: 10 }, { key: 'silver', label: 'Silver chest', price: 25 }, { key: 'gold', label: 'Gold chest', price: 50 }];
  const TREASURE_EMOJIS = ['🎁', '🍦', '🍕', '🎬', '🎮', '📺', '🛝', '🏊', '🎡', '🧁', '🍫', '📚', '🧸', '🎨', '⚽', '🚲', '🌙', '🎟️', '💶', '🦄'];

  const profiles = () => X()?.get('profiles', {}) ?? {};
  const colorOf = name => profiles()[name]?.color ?? window.jdMemberColor?.(name) ?? '#2b8c87';
  const data = () => { const value = X()?.get('treasures', {}) ?? {}; return { prices: value.prices ?? {}, custom: Array.isArray(value.custom) ? value.custom : [], history: Array.isArray(value.history) ? value.history : [] }; };
  const ledger = () => { const value = X()?.get('coins', []); return Array.isArray(value) ? value : []; };
  const balanceOf = member => ledger().filter(entry => entry.member === member).reduce((sum, entry) => sum + (Number(entry.delta) || 0), 0);
  const priceOf = (member, key) => Number(data().prices[member]?.[key] ?? CHESTS.find(chest => chest.key === key).price);
  const addCoins = entry => X().set('coins', [...ledger(), { id: uid('c'), date: dayKey(), at: new Date().toISOString(), ...entry }]);

  const state = { members: [], member: null };
  async function loadMembers() {
    try { const household = await (await fetch('/api/household/demo')).json(); state.members = Array.isArray(household?.members) ? household.members.filter(Boolean) : []; } catch { /* keep cached */ }
    const p = profiles(); state.members.sort((a, b) => (p[a]?.order ?? 999) - (p[b]?.order ?? 999));
    if (!state.members.includes(state.member)) state.member = state.members[0] ?? null;
  }

  // --- actions ------------------------------------------------------------------------------------
  async function redeem(member, item) {
    await X().ready?.();
    if (balanceOf(member) < item.price) { say(T('Not enough coins yet')); return; }
    const d = data();
    if (item.kind === 'custom' && !item.repeatable && d.history.some(h => h.key === item.key && h.member === member && !h.undoneAt)) return;
    const entry = { id: uid('h'), member, kind: item.kind, key: item.key, name: item.name, emoji: item.emoji, price: item.price, at: new Date().toISOString() };
    await X().set('treasures', { ...X().get('treasures', {}), history: [...d.history, entry] });
    await addCoins({ member, delta: -item.price, reason: 'treasure', historyId: entry.id, label: item.name });
    say(`${item.name} ${T('redeemed')} · −${item.price} ${T('coins')}`);
    celebrate(item);
    render();
  }
  async function undo(historyId) {
    await X().ready?.();
    const d = data(); const entry = d.history.find(h => h.id === historyId);
    if (!entry || entry.undoneAt) return;
    await X().set('treasures', { ...X().get('treasures', {}), history: d.history.map(h => (h.id === historyId ? { ...h, undoneAt: new Date().toISOString() } : h)) });
    if (!ledger().some(c => c.historyId === historyId && c.reason === 'refund')) await addCoins({ member: entry.member, delta: entry.price, reason: 'refund', historyId, label: entry.name });
    say(`${T('Undone')}: ${entry.name} · +${entry.price} ${T('coins')}`);
    render();
  }
  async function adjust(member, delta) {
    if (!delta) return;
    await X().ready?.();
    await addCoins({ member, delta, reason: 'adjust', label: T('Manual adjustment') });
    say(`${T('Balance adjusted')}: ${delta > 0 ? '+' : ''}${delta}`);
    render();
  }

  // --- rendering ---------------------------------------------------------------------------------
  const COIN = () => window.jdCoinSvg ?? '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#f5b53d"/></svg>';
  const coin = (count, gold = true) => `<span class="jd-coin${gold ? ' gold' : ''}"><span class="jd-coin-i" aria-hidden="true">${COIN()}</span>${count}</span>`;
  const avatar = name => { const photo = profiles()[name]?.photo; return `<span class="jd-avatar jd-avatar-md" style="--member:${esc(colorOf(name))}" aria-hidden="true">${photo ? `<img src="${esc(photo)}" alt="">` : esc(name.trim().slice(0, 1).toUpperCase() || '?')}</span>`; };
  const icon = d => `<svg class="tr-ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    history: icon('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 4v4.5H8M12 7.5V12l3 2"/>'),
    settings: icon('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>'),
    close: icon('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'), pen: icon('<path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5z"/>'),
    trash: icon('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'), undo: icon('<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>'),
    lock: icon('<rect x="5.5" y="10.5" width="13" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'), back: icon('<path d="M14.5 6 8.5 12l6 6"/>')
  };
  // Own chest illustration (bronze / silver / gold). Lid is a separate group so the overlay can open it.
  const CHEST_COLORS = {
    bronze: { body: '#c8783e', lid: '#de9455', band: '#8d4f24', rim: '#a9622f', lock: '#f4c25c', shine: '#f0b27c' },
    silver: { body: '#8fa0b4', lid: '#adbccd', band: '#5f6f84', rim: '#788aa0', lock: '#eef2f7', shine: '#d5dfea' },
    gold: { body: '#eaa21f', lid: '#f6c443', band: '#b9760c', rim: '#d38d14', lock: '#fff1b8', shine: '#ffe395' }
  };
  const chestSvg = key => {
    const c = CHEST_COLORS[key] ?? CHEST_COLORS.bronze;
    const gem = key === 'gold' ? '<path d="M60 64l4 4-4 5-4-5z" fill="#e8683f"/>' : key === 'silver' ? '<circle cx="60" cy="68" r="3.2" fill="#5b93e0"/>' : '<circle cx="60" cy="68" r="3" fill="#8d4f24"/>';
    return `<svg class="jd-chest jd-chest-${key}" viewBox="0 0 120 112" aria-hidden="true">
      <ellipse cx="60" cy="104" rx="46" ry="6" fill="rgba(31,41,51,.10)"/>
      <g class="jd-chest-glow"><circle cx="60" cy="52" r="34" fill="#ffe9a3"/></g>
      <g class="jd-chest-inside"><path d="M17 56h86v8H17z" fill="#5a3418"/><circle cx="44" cy="56" r="7" fill="#f5b53d"/><circle cx="60" cy="53" r="8" fill="#f8c95a"/><circle cx="76" cy="56" r="7" fill="#f5b53d"/></g>
      <g class="jd-chest-body"><rect x="14" y="56" width="92" height="44" rx="9" fill="${c.body}"/><rect x="14" y="56" width="92" height="7" fill="${c.rim}"/><rect x="22" y="56" width="10" height="44" fill="${c.band}"/><rect x="88" y="56" width="10" height="44" fill="${c.band}"/><rect x="14" y="90" width="92" height="10" rx="5" fill="rgba(0,0,0,.10)"/><rect x="36" y="66" width="46" height="4" rx="2" fill="${c.shine}" opacity=".55"/><rect x="49" y="58" width="22" height="22" rx="6" fill="${c.lock}" stroke="${c.band}" stroke-width="2"/>${gem}</g>
      <g class="jd-chest-lid"><path d="M14 58V40c0-14 13-24 46-24s46 10 46 24v18z" fill="${c.lid}"/><path d="M22 58V31.5c2.5-3 6-5.4 10-7V58z" fill="${c.band}"/><path d="M98 58V31.5c-2.5-3-6-5.4-10-7V58z" fill="${c.band}"/><path d="M14 52h92v6H14z" fill="${c.rim}"/><path d="M38 24c7-2 15-3 22-3" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".45" fill="none"/></g>
    </svg>`;
  };
  const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(window.jdLanguage?.() === 'en' ? 'en' : 'de', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

  let panel; let sheet; let sheetView = null;
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('section'); panel.className = 'card treasures-panel'; panel.dataset.i18nSkip = ''; panel.hidden = true;
    document.querySelector('.shell')?.append(panel);
    panel.addEventListener('click', event => {
      const t = event.target;
      if (t.closest('[data-back-to-more]')) { panel.hidden = true; document.querySelector('.tool-grid')?.closest('.card')?.removeAttribute('hidden'); return; }
      const redeemButton = t.closest('[data-tr-redeem]');
      if (redeemButton) { const member = redeemButton.closest('[data-member]')?.dataset.member; const item = member && itemsFor(member).find(i => i.key === redeemButton.dataset.trRedeem); if (item) { state.member = member; redeem(member, item); } return; }
      const open = t.closest('[data-tr-history], [data-tr-settings]');
      if (open) { const member = open.closest('[data-member]')?.dataset.member; if (member) openSheet(open.hasAttribute('data-tr-history') ? 'history' : 'settings', member); }
    });
    return panel;
  }
  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('dialog'); sheet.className = 'tr-sheet'; sheet.dataset.i18nSkip = '';
    document.body.append(sheet);
    sheet.addEventListener('click', event => {
      const t = event.target;
      if (t === sheet || t.closest('[data-tr-close]')) { sheet.close(); return; }
      const undoButton = t.closest('[data-tr-undo]'); if (undoButton) { guard('tasks', () => undo(undoButton.dataset.trUndo)); return; }
      const adj = t.closest('[data-tr-adjust]');
      if (adj) { const input = sheet.querySelector('.tr-adjust-amount'); const amount = Math.abs(Math.round(Number(input?.value) || 1)); guard('tasks', () => adjust(state.member, Number(adj.dataset.trAdjust) * amount)); return; }
      const priceButton = t.closest('[data-tr-price]'); if (priceButton) { guard('tasks', () => editPrice(priceButton.dataset.trPrice)); return; }
      const del = t.closest('[data-tr-delete]'); if (del) guard('tasks', () => deleteCustom(del.dataset.trDelete));
    });
    sheet.addEventListener('submit', event => {
      if (!event.target.matches('.tr-custom-form')) return;
      event.preventDefault();
      const form = event.target;
      guard('tasks', () => addCustom(form));
    });
    sheet.addEventListener('close', () => { sheetView = null; });
    return sheet;
  }
  function openSheet(view, member) {
    state.member = member; sheetView = view;
    ensureSheet(); renderSheet();
    if (!sheet.open) sheet.showModal();
  }
  function itemsFor(member) {
    const d = data();
    const chests = CHESTS.map(chest => ({ kind: 'chest', key: chest.key, name: T(chest.label), emoji: chest.key === 'gold' ? '🥇' : chest.key === 'silver' ? '🥈' : '🥉', price: priceOf(member, chest.key), repeatable: true }));
    const custom = d.custom.filter(c => !c.member || c.member === member).map(c => ({ kind: 'custom', key: c.id, name: c.name, emoji: c.emoji || '🎁', price: Number(c.price) || 0, repeatable: c.repeatable !== false, scope: c.member ? 'member' : 'all' }));
    return [...chests, ...custom];
  }
  async function editPrice(key) {
    const member = state.member; const chest = CHESTS.find(c => c.key === key);
    const next = window.prompt(`${T(chest.label)} – ${T('price in coins')}`, String(priceOf(member, key)));
    if (next === null) return;
    const value = Math.max(1, Math.min(9999, Math.round(Number(next))));
    if (!Number.isFinite(value)) return;
    await X().ready?.();
    const d = data();
    await X().set('treasures', { ...X().get('treasures', {}), prices: { ...d.prices, [member]: { ...(d.prices[member] ?? {}), [key]: value } } });
    say(T('Price updated')); render();
  }
  async function addCustom(form) {
    const name = form.elements.name.value.trim(); if (!name) return;
    const price = Math.max(1, Math.min(9999, Math.round(Number(form.elements.price.value) || 1)));
    await X().ready?.();
    const d = data();
    const item = { id: uid('t'), member: form.elements.scope.value === 'all' ? '' : state.member, name, emoji: form.elements.emoji.value || '🎁', price, repeatable: form.elements.repeatable.checked };
    await X().set('treasures', { ...X().get('treasures', {}), custom: [...d.custom, item] });
    say(T('Treasure added')); render();
  }
  async function deleteCustom(id) {
    const d = data(); const item = d.custom.find(c => c.id === id); if (!item) return;
    if (!window.confirm(`${T('Delete')} "${item.name}"?`)) return;
    await X().set('treasures', { ...X().get('treasures', {}), custom: d.custom.filter(c => c.id !== id) });
    say(T('Treasure deleted')); render();
  }


  function tileHtml(member, item, balance, d) {
    const locked = item.kind === 'custom' && !item.repeatable && d.history.some(h => h.key === item.key && h.member === member && !h.undoneAt);
    const missing = Math.max(0, item.price - balance);
    const ratio = item.price ? Math.min(1, balance / item.price) : 1;
    const label = locked ? `${item.name} – ${T('Redeemed')}` : missing ? `${item.name} – ${T('needs')} ${missing} ${T('more')}` : `${item.name} ${T('Redeem')} · ${item.price} ${T('coins')}`;
    const status = locked ? `<span class="tr-state">${ICON.lock}${T('Redeemed')}</span>` : missing ? `<span class="tr-state"><span class="tr-meter"><span style="width:${Math.round(ratio * 100)}%"></span></span>${T('needs')} ${missing}</span>` : `<span class="tr-state tr-ready">${T('Redeem')}</span>`;
    return `<article class="tr-card tr-${item.kind}${item.kind === 'chest' ? ` tr-${item.key}` : ''}${missing || locked ? ' is-locked' : ' is-ready'}"><button type="button" class="tr-tile" data-tr-redeem="${esc(item.key)}" aria-label="${esc(label)}" ${missing || locked ? 'disabled' : ''}>${item.kind === 'chest' ? chestSvg(item.key) : `<span class="tr-emoji" aria-hidden="true">${esc(item.emoji)}</span>`}<strong>${esc(item.name)}</strong><span class="tr-price">${coin(item.price, true)}</span>${status}</button></article>`;
  }
  function columnHtml(member) {
    const d = data(); const balance = balanceOf(member); const items = itemsFor(member);
    const chests = items.filter(i => i.kind === 'chest'); const custom = items.filter(i => i.kind === 'custom');
    return `<article class="tr-col" data-member="${esc(member)}" style="--member:${esc(colorOf(member))}">
      <header class="tr-col-head">${avatar(member)}<div class="tr-col-name"><strong>${esc(member)}</strong><span class="tr-balance" aria-label="${balance} ${T('coins')}">${coin(balance)}</span></div>
        <button type="button" class="tr-head-btn" data-tr-history aria-label="${esc(`${T('History')} ${member}`)}">${ICON.history}</button><button type="button" class="tr-head-btn tr-chip" data-tr-settings data-tr-member="${esc(member)}" aria-label="${esc(`${T('Settings')} ${member}`)}">${ICON.settings}</button></header>
      <div class="tr-col-body"><div class="tr-grid">${chests.map(item => tileHtml(member, item, balance, d)).join('')}</div>
      ${custom.length ? `<h3 class="tr-section">${T('Own treasures')}</h3><div class="tr-grid tr-grid-custom">${custom.map(item => tileHtml(member, item, balance, d)).join('')}</div>` : ''}</div></article>`;
  }
  function render() {
    renderSheet();
    if (!panel || panel.hidden) return;
    const head = `<div class="tr-top"><button type="button" class="tr-back" data-back-to-more="">${ICON.back}<span>${T('More')}</span></button><h2>${T('Treasures')}</h2><p class="tr-hint">${T('Completed tasks earn coins. Swap coins for a chest or your own treasure.')}</p></div>`;
    if (!state.members.length) { panel.innerHTML = `${head}<p class="muted tr-empty">${T('Add family members under More › Family to collect coins.')}</p>`; return; }
    const scroll = panel.querySelector('.tr-columns')?.scrollLeft ?? 0;
    panel.innerHTML = `${head}<div class="tr-columns" style="--cols:${state.members.length}">${state.members.map(columnHtml).join('')}</div>`;
    panel.querySelector('.tr-columns').scrollLeft = scroll;
  }

  function renderSheet() {
    if (!sheet?.open && !sheetView) return;
    if (!sheet || !sheetView) return;
    const member = state.member; if (!member) return;
    const d = data(); const balance = balanceOf(member);
    const head = title => `<header class="tr-sheet-head" style="--member:${esc(colorOf(member))}">${avatar(member)}<div><h2>${title}</h2><p>${esc(member)} · ${coin(balance)}</p></div><button type="button" class="tr-close" data-tr-close aria-label="${T('Close')}">${ICON.close}</button></header>`;
    if (sheetView === 'history') {
      const entries = ledger().filter(e => e.member === member).slice().reverse().slice(0, 60);
      const undone = new Set(d.history.filter(h => h.undoneAt).map(h => h.id));
      const reasonIcon = { task: '✅', meal: '🍽️', treasure: '🎁', refund: '↩️', adjust: '✏️' };
      sheet.innerHTML = `${head(T('History'))}<ol class="tr-history">${entries.map(e => `<li class="tr-h-${esc(e.reason)}${undone.has(e.historyId) && e.reason === 'treasure' ? ' undone' : ''}"><span class="tr-h-icon" aria-hidden="true">${reasonIcon[e.reason] ?? '•'}</span><span class="tr-h-label">${esc(e.reason === 'refund' ? `${T('Undone')}: ${e.label ?? ''}` : e.reason === 'adjust' ? T('Manual adjustment') : e.label ?? '')}<small>${esc(when(e.at))}</small></span><b class="${e.delta < 0 ? 'neg' : 'pos'}">${e.delta > 0 ? '+' : ''}${e.delta}</b>${e.reason === 'treasure' && !undone.has(e.historyId) ? `<button type="button" class="tr-pill-btn" data-tr-undo="${esc(e.historyId)}">${ICON.undo}${T('Undo')}</button>` : ''}</li>`).join('') || `<li class="tr-h-empty">${T('No coins yet. Complete tasks to earn some.')}</li>`}</ol>`;
      return;
    }
    const custom = d.custom.filter(c => !c.member || c.member === member);
    sheet.innerHTML = `${head(T('Treasure settings'))}
      <section class="tr-sheet-sec"><h3>${T('Adjust balance')}</h3><div class="tr-adjust" role="group" aria-label="${T('Adjust balance')}"><button type="button" class="tr-round" data-tr-adjust="-1" aria-label="${T('Remove coins')}">−</button><input class="tr-adjust-amount" type="number" min="1" max="999" value="1" aria-label="${T('Amount')}"><button type="button" class="tr-round" data-tr-adjust="1" aria-label="${T('Add coins')}">+</button></div></section>
      <section class="tr-sheet-sec"><h3>${T('Treasure chests')}</h3><ul class="tr-rows">${CHESTS.map(chest => `<li><span class="tr-row-chest">${chestSvg(chest.key)}</span><span class="tr-row-name">${T(chest.label)}</span>${coin(priceOf(member, chest.key))}<button type="button" class="tr-pill-btn" data-tr-price="${chest.key}" aria-label="${esc(`${T('Change price')} ${T(chest.label)}`)}">${ICON.pen}${T('Price')}</button></li>`).join('')}</ul></section>
      <section class="tr-sheet-sec"><h3>${T('Own treasures')}</h3><ul class="tr-rows">${custom.map(c => `<li><span class="tr-row-emoji" aria-hidden="true">${esc(c.emoji || '🎁')}</span><span class="tr-row-name">${esc(c.name)}<small>${c.repeatable !== false ? T('repeatable') : T('one-time')}${c.member ? '' : ` · ${T('everyone')}`}</small></span>${coin(Number(c.price) || 0)}<button type="button" class="tr-pill-btn danger" data-tr-delete="${esc(c.id)}" aria-label="${esc(`${T('Delete')} ${c.name}`)}">${ICON.trash}</button></li>`).join('') || `<li class="tr-h-empty">${T('No own treasures yet, e.g. "Pick the movie" or "Ice cream".')}</li>`}</ul>
      <details class="tr-add"><summary>+ ${T('Add own treasure')}</summary><form class="tr-custom-form"><label class="jd-field">${T('Name')}<input name="name" required maxlength="60" placeholder="${T('e.g. Ice cream')}"></label><label class="jd-field">${T('Emoji')}<select name="emoji">${TREASURE_EMOJIS.map(e => `<option>${e}</option>`).join('')}</select></label><label class="jd-field">${T('Price')}<input name="price" type="number" min="1" max="9999" value="5"></label><label class="jd-field">${T('For')}<select name="scope"><option value="member">${esc(member)}</option><option value="all">${T('Everyone')}</option></select></label><label class="tr-check"><input type="checkbox" name="repeatable" checked> ${T('Can be redeemed again')}</label><button type="submit" class="tr-submit">${T('Add')}</button></form></details></section>`;
  }

  // Full overlay: white card, chest lid flies open, coins + confetti + sparkles burst out. Closes on tap.
  function celebrate(item) {
    document.querySelector('.jd-chest-overlay')?.remove();
    const still = reducedMotion();
    const overlay = document.createElement('div'); overlay.className = `jd-chest-overlay${still ? ' still' : ''}`; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', item.name); overlay.dataset.i18nSkip = '';
    const bits = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (i / n - 0.5) * Math.PI * 1.9 + (Math.random() - 0.5) * 0.3; const dist = 110 + Math.random() * 120; const size = 26 + Math.round(Math.random() * 26);
      const sy = Math.sin(angle); bits.push(`<span class="jd-burst-coin" style="--dx:${Math.round(Math.cos(angle) * dist)}px;--dy:${Math.round(sy * dist * (sy > 0 ? 0.35 : 0.95))}px;--s:${size}px;--d:${(Math.random() * 0.25).toFixed(2)}s;--r:${Math.round(Math.random() * 360 - 180)}deg">${COIN()}</span>`);
    }
    const colors = ['var(--d-rose)', 'var(--d-sky)', 'var(--d-mint)', 'var(--d-sun)', 'var(--d-lav)', 'var(--d-peach)'];
    for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2; const dist = 90 + Math.random() * 170;
      bits.push(`<i class="jd-burst-bit" style="--dx:${Math.round(Math.cos(angle) * dist)}px;--dy:${Math.round(Math.sin(angle) * dist)}px;--d:${(Math.random() * 0.3).toFixed(2)}s;--r:${Math.round(Math.random() * 720)}deg;background:${colors[i % colors.length]}"></i>`);
    }
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2; const dist = 70 + Math.random() * 150;
      bits.push(`<span class="jd-burst-spark" style="--dx:${Math.round(Math.cos(angle) * dist)}px;--dy:${Math.round(Math.sin(angle) * dist)}px;--d:${(0.2 + Math.random() * 0.5).toFixed(2)}s;color:${colors[(i + 2) % colors.length]}"><svg viewBox="0 0 20 20"><path d="M10 1l2.2 6.8L19 10l-6.8 2.2L10 19l-2.2-6.8L1 10l6.8-2.2z" fill="currentColor"/></svg></span>`);
    }
    overlay.innerHTML = `<div class="jd-chest-pop"><div class="jd-chest-stage"><div class="jd-burst" aria-hidden="true">${bits.join('')}</div>${item.kind === 'chest' ? chestSvg(item.key) : `<span class="tr-emoji big" aria-hidden="true">${esc(item.emoji)}</span>`}</div><strong>${esc(item.name)}</strong><span>${T('Enjoy your treasure!')}</span><button type="button" class="jd-chest-close">${T('Tap to close')}</button></div>`;
    document.body.append(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = event => { if (event.key === 'Escape') close(); };
    overlay.addEventListener('click', close); document.addEventListener('keydown', onKey);
    overlay.querySelector('.jd-chest-close').focus({ preventScroll: true });
    setTimeout(() => { if (overlay.isConnected) close(); }, 8000);
  }

  // --- open / hide wiring ------------------------------------------------------------------------
  window.jdOpenTreasures = async () => {
    ensurePanel();
    document.querySelector('.tool-grid')?.closest('.card')?.setAttribute('hidden', '');
    document.querySelectorAll('.school-panel, .calendar-week-panel, .rewards-panel, .meals-panel, .photos-panel, .members-panel, .routines-panel').forEach(el => { el.hidden = true; });
    panel.hidden = false;
    await X()?.ready?.();
    await loadMembers();
    render();
  };
  // Capture on window runs before optional.js' document-level capture handler, so this replaces the old Rewards panel.
  window.addEventListener('click', event => {
    const tool = event.target.closest('[data-tool]');
    if (tool?.dataset.tool === 'Rewards') {
      event.preventDefault(); event.stopImmediatePropagation();
      window.jdOpenTreasures().then(() => say('Rewards opened')).catch(() => say('Rewards unavailable; try again when connected'));
      return;
    }
    if (!panel) return;
    if (tool) { panel.hidden = true; return; }
    const link = event.target.closest('a[href^="#"]');
    if (link && ['today', 'calendar', 'tasks', 'lists', 'school', 'more', 'meals'].includes(link.getAttribute('href').slice(1))) panel.hidden = true;
  }, true);
  const relabel = () => { const button = document.querySelector('[data-tool="Rewards"]'); if (button) { button.dataset.i18nSkip = ''; button.textContent = `💎 ${T('Treasures')}`; } };
  ['coins', 'treasures', 'profiles'].forEach(key => X()?.subscribe(key, () => render()));
  document.addEventListener('change', event => { if (event.target.id === 'language-select') setTimeout(() => { relabel(); render(); }, 0); });

  Object.assign(DE, {
    'TREASURES': 'SCHÄTZE', 'Treasures': 'Schätze', 'More': 'Mehr', 'Completed tasks earn coins. Swap coins for a chest or your own treasure.': 'Erledigte Aufgaben bringen Münzen. Tausche sie gegen eine Truhe oder einen eigenen Schatz.',
    'Add family members under More › Family to collect coins.': 'Lege Familienmitglieder unter Mehr › Familie an, um Münzen zu sammeln.', 'Profile': 'Profil', 'coins': 'Münzen', 'Adjust balance': 'Kontostand korrigieren',
    'Remove coins': 'Münzen abziehen', 'Add coins': 'Münzen hinzufügen', 'Amount': 'Anzahl', 'Bronze chest': 'Bronze-Truhe', 'Silver chest': 'Silber-Truhe', 'Gold chest': 'Gold-Truhe',
    'repeatable': 'wiederholbar', 'one-time': 'einmalig', 'everyone': 'alle', 'Everyone': 'Alle', 'Redeemed': 'Eingelöst', 'needs': 'noch', 'more': 'Münzen', 'Redeem': 'Einlösen', 'Change price': 'Preis ändern', 'Price': 'Preis',
    'Delete': 'Löschen', 'Treasure chests': 'Schatztruhen', 'Own treasures': 'Eigene Schätze', 'No own treasures yet, e.g. "Pick the movie" or "Ice cream".': 'Noch keine eigenen Schätze, z. B. „Film aussuchen“ oder „Eis essen“.',
    'Add own treasure': 'Eigenen Schatz anlegen', 'Name': 'Name', 'e.g. Ice cream': 'z. B. Eis essen', 'Emoji': 'Emoji', 'For': 'Für', 'Can be redeemed again': 'Mehrfach einlösbar', 'Add': 'Hinzufügen',
    'History': 'Verlauf', 'Undone': 'Rückgängig gemacht', 'Manual adjustment': 'Manuelle Korrektur', 'Undo': 'Rückgängig', 'No coins yet. Complete tasks to earn some.': 'Noch keine Münzen. Erledige Aufgaben, um welche zu verdienen.',
    'Not enough coins yet': 'Noch nicht genug Münzen', 'redeemed': 'eingelöst', 'Balance adjusted': 'Kontostand korrigiert', 'price in coins': 'Preis in Münzen', 'Price updated': 'Preis aktualisiert',
    'Treasure added': 'Schatz angelegt', 'Treasure deleted': 'Schatz gelöscht', 'Enjoy your treasure!': 'Viel Freude mit deinem Schatz!', 'Tap to close': 'Tippen zum Schließen', 'Settings': 'Einstellungen', 'Treasure settings': 'Schätze einstellen', 'Close': 'Schließen', 'Rewards opened': 'Schätze geöffnet', 'Rewards unavailable; try again when connected': 'Schätze nicht verfügbar; bitte erneut versuchen'
  });
  relabel();
  window.jdTreasures = { balanceOf, redeem: (member, key) => { const item = itemsFor(member).find(i => i.key === key); return item ? redeem(member, item) : null; }, undo, adjust };
})();
