// tasks-plus: Tasks tab board (per-profile columns, Morning/Daytime/Evening, emoji, coins, progress ring, confetti),
// per-day completion state for recurring tasks and the Today task block.
// Data: server tasks (/api/tasks: title, owner, recurrence, recurrenceDays) + extras.taskMeta {tasks:{id:{emoji,category,coins}}, completions:{id:{'YYYY-MM-DD':true}}}
// Coins: extras.coins ledger [{id,member,delta,reason,taskId,date,at,label}] (shared with public/features/treasures.js).
(() => {
  const X = () => window.jdExtras;
  const DE = {}; // filled below
  const T = key => (window.jdLanguage?.() === 'en' ? key : (DE[key] ?? key));
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const say = message => { const el = document.querySelector('#live-region'); if (el) el.textContent = message; };
  const guard = (area, fn) => (window.jdLock?.guard ? window.jdLock.guard(area, fn) : fn());
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAY_SHORT = { Mon: 'Mo', Tue: 'Tu', Wed: 'We', Thu: 'Th', Fri: 'Fr', Sat: 'Sa', Sun: 'Su' };
  // Default presets for the "New task" dialog; "recently used" titles are kept in extras.taskMeta.recent.
  const PRESETS = [
    { title: 'Empty the dishwasher', emoji: '🍽️', category: 'morning', coins: 1 },
    { title: 'Fold laundry', emoji: '🧺', category: 'day', coins: 1 },
    { title: 'Sweep the stairs', emoji: '🧹', category: 'day', coins: 1 },
    { title: 'Clean the bathroom', emoji: '🛁', category: 'day', coins: 2 },
  ];
  const RECENT_MAX = 8;
  const CATS = [{ id: 'morning', label: 'Morning', icon: '🌅' }, { id: 'day', label: 'Daytime', icon: '☀️' }, { id: 'evening', label: 'Evening', icon: '🌙' }];
  const EMOJIS = ['🦷', '🛏️', '👕', '🧦', '🚿', '🛁', '🧼', '💇', '🍳', '🥣', '🍽️', '🥪', '🍎', '🥕', '💧', '💊', '🎒', '📚', '✏️', '📖', '🎹', '🎸', '⚽', '🚲', '🏃', '🧘', '🐶', '🐱', '🐟', '🌱', '🧹', '🧺', '🗑️', '♻️', '🧽', '🪣', '🛒', '📦', '🧸', '🎨', '🧩', '🎮', '📺', '📱', '😴', '⏰', '🌞', '🌙', '🚗', '🚌', '🏫', '💼', '📞', '✉️', '💰', '🎁', '❤️', '⭐', '✅', '🙏'];
  const DEFAULT_SETTINGS = { hideDoneTasks: false, showSchool: true, showTaskCounts: true, generalTaskList: false, defaultCalendarView: 'week', idleMinutes: 15, quietStart: '', quietEnd: '', photoIntervalMin: 5, stateCode: '' };
  const GENERAL = 'Shared';
  // Own coin (not the reference's): gold disc, inner rim, four-point sparkle.
  const COIN_SVG = '<svg class="jd-coin-svg" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9.2" class="cn-a"/><circle cx="10" cy="10" r="6.6" class="cn-b"/><path d="M10 5.6l1.15 3.25L14.4 10l-3.25 1.15L10 14.4l-1.15-3.25L5.6 10l3.25-1.15z" class="cn-c"/></svg>';
  window.jdCoinSvg = COIN_SVG;
  window.jdFlyCoin = (rect, amount) => flyCoin(rect, amount);
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const settings = () => ({ ...DEFAULT_SETTINGS, ...(X()?.get('settings', {}) ?? {}) });
  const profiles = () => X()?.get('profiles', {}) ?? {};
  const colorOf = name => profiles()[name]?.color ?? window.jdMemberColor?.(name) ?? '#2b8c87';
  const taskMeta = () => { const value = X()?.get('taskMeta', {}) ?? {}; return { tasks: value.tasks ?? {}, completions: value.completions ?? {} }; };
  const infoOf = task => ({ emoji: '✅', category: 'day', coins: 1, ...(taskMeta().tasks[task.id] ?? {}) });
  const ledger = () => { const value = X()?.get('coins', []); return Array.isArray(value) ? value : []; };
  const balanceOf = member => ledger().filter(entry => entry.member === member).reduce((sum, entry) => sum + (Number(entry.delta) || 0), 0);

  const state = { tasks: [], members: [], viewDate: new Date(), filter: null, mode: 'day', cat: 'all', hideDone: null, loaded: false };
  const sortMembers = names => { const p = profiles(); return [...names].sort((a, b) => (p[a]?.order ?? 999) - (p[b]?.order ?? 999) || names.indexOf(a) - names.indexOf(b)); };
  async function refresh() {
    try {
      const [tasks, household] = await Promise.all([fetch('/api/tasks?limit=200').then(r => (r.ok ? r.json() : [])), fetch('/api/household/demo').then(r => (r.ok ? r.json() : {}))]);
      if (Array.isArray(tasks)) state.tasks = tasks.slice().reverse();
      state.members = Array.isArray(household?.members) ? household.members.filter(Boolean) : [];
      state.loaded = true;
    } catch { /* keep cached data */ }
    renderAll();
  }

  // --- schedule & completion -------------------------------------------------------------
  const scheduledOn = (task, date) => {
    if (!task.recurrence || task.recurrence === 'daily') return true;
    return task.recurrenceDays?.length ? task.recurrenceDays.includes(WEEK[date.getDay()]) : true;
  };
  const completionsOf = task => taskMeta().completions[task.id] ?? {};
  const anyCompletion = task => Object.values(completionsOf(task)).some(Boolean);
  const isDone = (task, key) => (task.recurrence ? Boolean(completionsOf(task)[key]) : Boolean(task.completed || anyCompletion(task)));
  const visibleOn = (task, date) => {
    if (!scheduledOn(task, date)) return false;
    if (task.recurrence) return true;
    const key = dayKey(date); const record = completionsOf(task);
    if (anyCompletion(task)) return Boolean(record[key]); // one-time: shown on the day it was done
    return true; // open one-time tasks stay visible until done (legacy completed tasks too)
  };
  const isGeneral = task => !state.members.includes(task.owner);
  const tasksFor = (owner, date) => state.tasks.filter(task => (owner === GENERAL ? isGeneral(task) : task.owner === owner) && visibleOn(task, date));

  async function settleCoins(task, date, target) {
    const all = ledger();
    const net = all.filter(entry => entry.taskId === task.id && entry.date === date && entry.reason === 'task').reduce((sum, entry) => sum + (Number(entry.delta) || 0), 0);
    if (net === target) return;
    await X().set('coins', [...all, { id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, member: task.owner, delta: target - net, reason: 'task', taskId: task.id, date, label: task.title, at: new Date().toISOString() }]);
  }

  async function toggle(task, date, sourceEl) {
    if (!X()) return;
    const rect = sourceEl?.isConnected ? sourceEl.getBoundingClientRect() : null;
    await X().ready?.();
    const key = dayKey(date);
    const next = !isDone(task, key);
    if (next) { confetti(rect); if (state.members.includes(task.owner)) flyCoin(rect, Number(infoOf(task).coins) || 0); }
    const meta = taskMeta();
    const record = { ...(meta.completions[task.id] ?? {}) };
    const previousDates = Object.keys(record).filter(k => record[k]);
    if (task.recurrence) { if (next) record[key] = true; else delete record[key]; }
    else if (next) record[key] = true;
    else for (const k of Object.keys(record)) delete record[k];
    await X().set('taskMeta', { ...X().get('taskMeta', {}), tasks: meta.tasks, completions: { ...meta.completions, [task.id]: record } });
    if (!task.recurrence) {
      task.completed = next;
      fetch(`/api/tasks/${task.id}/${next ? 'complete' : 'undo'}`, { method: 'POST' }).catch(() => {});
    }
    const coins = Number(infoOf(task).coins) || 0;
    if (state.members.includes(task.owner) && coins > 0) {
      if (task.recurrence || next) await settleCoins(task, key, next ? coins : 0);
      else for (const k of previousDates) await settleCoins(task, k, 0);
    }
    say(next ? (coins && !isGeneral(task) ? `${T('Task completed')} · +${coins} ${T('coins')}` : T('Task completed')) : T('Task reopened'));
    renderAll();
  }

  function confetti(rect) {
    if (reducedMotion() || !rect || (!rect.width && !rect.height)) return;
    const host = document.createElement('div'); host.className = 'jd-confetti'; host.setAttribute('aria-hidden', 'true');
    host.style.left = `${rect.left + rect.width - 22}px`; host.style.top = `${rect.top + rect.height / 2}px`;
    const colors = ['var(--d-sun)', 'var(--d-rose)', 'var(--d-mint)', 'var(--d-sky)', 'var(--d-lav)', 'var(--d-peach)'];
    for (let i = 0; i < 22; i++) {
      const bit = document.createElement('i');
      const angle = (Math.PI * 2 * i) / 22 + Math.random() * 0.4; const dist = 36 + Math.random() * 54;
      bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`); bit.style.setProperty('--dy', `${Math.sin(angle) * dist - 24}px`);
      bit.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`); bit.style.background = colors[i % colors.length];
      if (i % 3 === 0) bit.className = 'round';
      host.append(bit);
    }
    document.body.append(host); setTimeout(() => host.remove(), 1200);
  }
  // "+N coin" pill that floats up from the completed task (reference: white pill with gold coin).
  function flyCoin(rect, amount) {
    if (reducedMotion() || !rect || (!rect.width && !rect.height) || !amount) return;
    const pill = document.createElement('div'); pill.className = 'jd-coin-fly'; pill.setAttribute('aria-hidden', 'true');
    pill.innerHTML = `<b>+${amount}</b>${COIN_SVG}`;
    pill.style.left = `${Math.min(window.innerWidth - 60, rect.left + rect.width - 40)}px`; pill.style.top = `${rect.top - 6}px`;
    document.body.append(pill); setTimeout(() => pill.remove(), 1500);
  }

  // --- icons & shared rendering helpers -------------------------------------------------------
  const svg = (d, cls = '') => `<svg class="tb-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    morning: svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
    day: svg('<rect x="5" y="4.5" width="14" height="16.5" rx="2.6"/><path d="M9 3.5h6v3H9zM8.6 11h6.8M8.6 14.6h4.6"/>'),
    evening: svg('<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z"/>'),
    prev: svg('<path d="M14.5 6 8.5 12l6 6"/>'), next: svg('<path d="M9.5 6l6 6-6 6"/>'),
    plus: svg('<path d="M12 5.5v13M5.5 12h13"/>'), check: svg('<path d="M6 12.5l4 4 8-9"/>', 'tb-ico-check'),
    pen: svg('<path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5z"/><path d="M13.8 7l3.2 3.2"/>'),
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M3.5 3.5l17 17M10 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.6M6.4 7.2A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.3-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    home: svg('<path d="M4 11.2 12 4.5l8 6.7"/><path d="M6 9.8V19.5h12V9.8"/><path d="M10 19.5v-5h4v5"/>')
  };
  const CAT_ICON = { morning: ICON.morning, day: ICON.day, evening: ICON.evening };
  const memberColor = owner => (owner === GENERAL ? 'var(--d-grey)' : colorOf(owner));
  const avatar = (name, size = 'md') => {
    if (name === GENERAL) return `<span class="jd-avatar jd-avatar-${size} jd-avatar-general" style="--member:var(--d-grey)" aria-hidden="true">${ICON.home}</span>`;
    const photo = profiles()[name]?.photo;
    return photo ? `<span class="jd-avatar jd-avatar-${size}" style="--member:${esc(colorOf(name))}" aria-hidden="true"><img src="${esc(photo)}" alt=""></span>` : `<span class="jd-avatar jd-avatar-${size}" style="--member:${esc(colorOf(name))}" aria-hidden="true">${esc(name.trim().slice(0, 1).toUpperCase() || '?')}</span>`;
  };
  const ring = (done, total, size = 44) => {
    const r = size / 2 - 4; const c = 2 * Math.PI * r; const ratio = total ? done / total : 0;
    return `<svg class="jd-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(`${done} / ${total} ${T('done today')}`)}"><title>${esc(`${done} / ${total} ${T('done today')}`)}</title><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="jd-ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="jd-ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - ratio)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${total && done === total ? '★' : `${done}/${total}`}</text></svg>`;
  };
  // Avatar wrapped in a progress ring + open-task badge (reference column header).
  const ringAvatar = (owner, done, total, open, showCount) => {
    const size = 58; const r = 26.5; const c = 2 * Math.PI * r; const ratio = total ? done / total : 0;
    return `<span class="tb-ring-avatar" style="--member:${esc(memberColor(owner))}">${avatar(owner)}<svg class="tb-ring" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="29" cy="29" r="${r}" class="tb-ring-bg"/><circle cx="29" cy="29" r="${r}" class="tb-ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - ratio)).toFixed(1)}" transform="rotate(-90 29 29)"/></svg>${showCount && open ? `<span class="tb-badge">${open}</span>` : ''}</span>`;
  };
  const coin = (count, gold) => `<span class="jd-coin${gold ? ' gold' : ''}" title="${esc(`${T('Coin balance')}: ${count}`)}"><span class="jd-coin-i" aria-hidden="true">${COIN_SVG}</span>${count}</span>`;
  const recurrenceText = task => (!task.recurrence ? T('Once') : task.recurrence === 'daily' || !task.recurrenceDays?.length ? T('Daily') : task.recurrenceDays.map(day => T(DAY_SHORT[day])).join(' '));
  // General (profile-less) column: always when the setting is on; otherwise only when it has something to show,
  // so quick-captured (unassigned) tasks never disappear. Shown first, like the reference "Allgemein" column.
  const ownersToShow = (date = state.viewDate, all = false) => {
    const owners = sortMembers(state.members);
    const hasGeneral = state.tasks.some(task => isGeneral(task) && (all || visibleOn(task, date)));
    if (settings().generalTaskList || !owners.length || hasGeneral) owners.unshift(GENERAL);
    return owners;
  };
  const ownerLabel = owner => (owner === GENERAL ? T('General') : owner);
  const catOf = task => (CATS.some(c => c.id === infoOf(task).category) ? infoOf(task).category : 'day');
  const phoneQuery = window.matchMedia?.('(max-width:760px)');
  const isPhone = () => Boolean(phoneQuery?.matches);
  const hideDone = () => (state.hideDone ?? settings().hideDoneTasks);

  // --- Tasks tab board -----------------------------------------------------------------------
  let board;
  function ensureBoard() {
    if (board) return board;
    board = document.createElement('section'); board.className = 'card tasks-board-panel'; board.hidden = true; board.dataset.i18nSkip = '';
    board.innerHTML = `<h2 class="sr-only tb-heading"></h2><div class="tb-mhead"></div>
      <div class="tb-toolbar"><div class="tb-day"><button type="button" class="tb-nav" data-tb-day="-1">${ICON.prev}</button><button type="button" class="tb-today" data-tb-day="0">${ICON.day}<span class="tb-date"></span></button><button type="button" class="tb-nav" data-tb-day="1">${ICON.next}</button></div>
      <div class="tb-mode" role="group"><button type="button" class="tb-chip" data-tb-mode="day" aria-pressed="true"></button><button type="button" class="tb-chip" data-tb-mode="all" aria-pressed="false"></button></div>
      <div class="tb-filter" role="group"></div><button type="button" class="tb-new" data-tb-add>${ICON.plus}<span></span></button></div>
      <div class="tb-columns"></div>
      <div class="tb-bottom"><div class="tb-seg" role="group">${CATS.map(cat => `<button type="button" data-tb-cat="${cat.id}" aria-pressed="false">${CAT_ICON[cat.id]}<span></span></button>`).join('')}</div><button type="button" class="tb-add-wide" data-tb-add>${ICON.plus}</button></div>`;
    document.querySelector('.shell')?.append(board);
    board.addEventListener('click', event => {
      const add = event.target.closest('[data-tb-add]');
      if (add) { guard('tasks', () => openEditor(null, add.dataset.tbAdd || (state.filter && state.filter !== 'all' ? state.filter : undefined))); return; }
      const day = event.target.closest('[data-tb-day]');
      if (day) { const n = Number(day.dataset.tbDay); const d = n ? new Date(state.viewDate) : new Date(); if (n) d.setDate(d.getDate() + n); state.viewDate = d; renderBoard(); return; }
      const mode = event.target.closest('[data-tb-mode]');
      if (mode) { state.mode = mode.dataset.tbMode; renderBoard(); return; }
      const cat = event.target.closest('[data-tb-cat]');
      if (cat) { state.cat = state.cat === cat.dataset.tbCat ? 'all' : cat.dataset.tbCat; renderBoard(); say(state.cat === 'all' ? T('All times of day') : T(CATS.find(c => c.id === state.cat).label)); return; }
      const eye = event.target.closest('[data-tb-eye]');
      if (eye) { state.hideDone = !hideDone(); renderBoard(); return; }
      const filter = event.target.closest('[data-tb-filter]');
      if (filter) { state.filter = filter.dataset.tbFilter; renderBoard(); return; }
      const edit = event.target.closest('[data-task-edit]');
      if (edit) { const task = state.tasks.find(item => item.id === edit.dataset.taskEdit); if (task) guard('tasks', () => openEditor(task)); return; }
      const toggleButton = event.target.closest('[data-task-toggle]');
      if (toggleButton) { const task = state.tasks.find(item => item.id === toggleButton.dataset.taskToggle); if (task) toggle(task, state.viewDate, toggleButton); }
    });
    phoneQuery?.addEventListener?.('change', () => renderBoard());
    return board;
  }

  const ownerTasks = (owner, all) => (all ? state.tasks.filter(task => (owner === GENERAL ? isGeneral(task) : task.owner === owner)) : tasksFor(owner, state.viewDate));
  function itemHtml(task, owner, all, key) {
    const info = infoOf(task); const isDoneNow = isDone(task, key);
    const action = all ? `data-task-edit="${esc(task.id)}" aria-label="${esc(`${T('Edit')} ${task.title}`)}"` : `data-task-toggle="${esc(task.id)}" aria-pressed="${isDoneNow}" aria-label="${esc(`${T(isDoneNow ? 'Reopen' : 'Complete')} ${task.title}`)}"`;
    const coins = owner !== GENERAL && Number(info.coins) > 0 ? coin(Number(info.coins), isDoneNow) : '';
    return `<li class="tb-item${isDoneNow ? ' done' : ''}"><button type="button" class="tb-task" ${action} data-i18n-skip><span class="tb-emoji" aria-hidden="true">${esc(info.emoji)}</span><span class="tb-text"><span class="tb-title">${esc(task.title)}</span><small>${coins}<span>${esc(recurrenceText(task))}</span></small></span><span class="tb-check" aria-hidden="true">${all ? ICON.pen : ICON.check}</span></button>${all ? '' : `<button type="button" class="tb-edit" data-task-edit="${esc(task.id)}" aria-label="${esc(`${T('Edit')} ${task.title}`)}" data-i18n-skip>${ICON.pen}</button>`}</li>`;
  }
  function columnHtml(owner) {
    const key = dayKey(state.viewDate); const s = settings(); const all = state.mode === 'all';
    const tasks = ownerTasks(owner, all);
    const done = tasks.filter(task => isDone(task, key)).length;
    const inCat = state.cat === 'all' ? tasks : tasks.filter(task => catOf(task) === state.cat);
    const shown = hideDone() && !all ? inCat.filter(task => !isDone(task, key)) : inCat;
    const sections = CATS.filter(cat => state.cat === 'all' || cat.id === state.cat).map(cat => {
      const items = shown.filter(task => catOf(task) === cat.id);
      if (!items.length) return '';
      const open = items.filter(task => !isDone(task, key)).length;
      return `<section class="tb-cat tb-cat-${cat.id}"><h3>${CAT_ICON[cat.id]}<span>${T(cat.label)}</span>${s.showTaskCounts && open && !all ? `<span class="tb-count">${open}</span>` : ''}</h3><ul>${items.map(task => itemHtml(task, owner, all, key)).join('')}</ul></section>`;
    }).join('');
    const doneHidden = hideDone() && !all ? inCat.filter(task => isDone(task, key)).length : 0;
    const hiddenDone = doneHidden ? `<p class="tb-done-note">${ICON.check}${doneHidden} ${T('done')}</p>` : '';
    const empty = !tasks.length ? `<p class="tb-empty">${T(all ? 'No tasks yet.' : 'No tasks for this day.')}</p>` : (!shown.length && !doneHidden ? `<p class="tb-empty">${state.cat === 'all' ? `${T('All done!')} 🎉` : T('Nothing for this time of day.')}</p>` : (!shown.length ? `<p class="tb-empty">${T('All done!')} 🎉</p>` : ''));
    const balance = owner !== GENERAL ? `<span class="tb-balance">${coin(balanceOf(owner), true)}</span>` : '';
    const progress = s.showTaskCounts ? `<small class="tb-progress-text">${all ? `${tasks.length} ${T('tasks')}` : `${done} / ${tasks.length} ${T('done')}`}</small>` : '';
    return `<article class="tb-col${owner === GENERAL ? ' tb-col-general' : ''}" style="--member:${esc(memberColor(owner))}" data-owner="${esc(owner)}"><header class="tb-col-head"><button type="button" class="tb-col-open" data-tb-filter="${esc(owner)}" aria-label="${esc(`${T('Show only')} ${ownerLabel(owner)}`)}">${ringAvatar(owner, done, tasks.length, tasks.length - done, s.showTaskCounts && !all)}</button><div class="tb-col-name"><strong data-i18n-skip>${esc(ownerLabel(owner))}</strong><span class="tb-col-meta">${balance}${progress}</span></div><button type="button" class="tb-col-add" data-tb-add="${esc(owner)}" aria-label="${esc(`${T('Add task for')} ${ownerLabel(owner)}`)}">${ICON.plus}</button></header><div class="tb-col-body">${sections}${empty}${hiddenDone}</div></article>`;
  }
  function mobileHeadHtml(owner) {
    const key = dayKey(state.viewDate); const all = state.mode === 'all';
    const tasks = ownerTasks(owner, all); const done = tasks.filter(task => isDone(task, key)).length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    return `<div class="tb-mhead-in" style="--member:${esc(memberColor(owner))}"><button type="button" class="tb-icon-btn" data-tb-filter="all" aria-label="${T('All profiles')}">${ICON.prev}</button>${avatar(owner)}<div class="tb-mhead-name"><strong data-i18n-skip>${esc(ownerLabel(owner))}</strong><span class="tb-bar" role="img" aria-label="${done} / ${tasks.length} ${T('done')}"><span style="width:${pct}%"></span><b>${done}/${tasks.length}</b></span></div><button type="button" class="tb-icon-btn" data-tb-eye aria-pressed="${hideDone()}" aria-label="${T(hideDone() ? 'Show done tasks' : 'Hide done tasks')}">${hideDone() ? ICON.eyeOff : ICON.eye}</button><button type="button" class="tb-icon-btn" data-tb-add="${esc(owner)}" aria-label="${esc(`${T('Add task for')} ${ownerLabel(owner)}`)}">${ICON.plus}</button></div>`;
  }

  function renderBoard() {
    if (!board || board.hidden) return;
    const all = state.mode === 'all';
    const owners = ownersToShow(state.viewDate, all);
    // Phone: open on a single profile (reference mobile view); desktop/wall: everyone side by side.
    if (state.filter == null) state.filter = isPhone() ? (owners.find(owner => owner !== GENERAL) ?? 'all') : 'all';
    if (state.filter !== 'all' && !owners.includes(state.filter)) state.filter = 'all';
    const date = state.viewDate; const key = dayKey(date); const today = dayKey();
    const single = state.filter !== 'all';
    board.classList.toggle('is-single', single);
    board.classList.toggle('is-all-mode', all);
    board.querySelector('.tb-heading').textContent = T('Tasks & routines');
    board.querySelector('.tb-day').hidden = all;
    board.querySelector('[data-tb-day="-1"]').setAttribute('aria-label', T('Previous day'));
    board.querySelector('[data-tb-day="1"]').setAttribute('aria-label', T('Next day'));
    const offset = Math.round((new Date(`${key}T12:00`) - new Date(`${today}T12:00`)) / 86400000);
    const lang = window.jdLanguage?.() === 'en' ? 'en' : 'de';
    const label = offset === 0 ? T('Today') : offset === 1 ? T('Tomorrow') : offset === -1 ? T('Yesterday') : date.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
    board.querySelector('.tb-date').textContent = label;
    board.querySelector('.tb-today').setAttribute('aria-label', offset === 0 ? `${T('Today')}, ${date.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}` : `${date.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })} – ${T('back to today')}`);
    board.querySelector('.tb-mode').setAttribute('aria-label', T('View'));
    board.querySelectorAll('[data-tb-mode]').forEach(button => { button.textContent = T(button.dataset.tbMode === 'day' ? 'Day' : 'All tasks'); button.setAttribute('aria-pressed', String(button.dataset.tbMode === state.mode)); });
    board.querySelector('.tb-new span').textContent = T('New task');
    board.querySelector('.tb-new').setAttribute('aria-label', T('＋ New task'));
    board.querySelector('.tb-seg').setAttribute('aria-label', T('Time of day'));
    board.querySelectorAll('[data-tb-cat]').forEach(button => { button.querySelector('span').textContent = T(CATS.find(c => c.id === button.dataset.tbCat).label); button.setAttribute('aria-pressed', String(state.cat === button.dataset.tbCat)); });
    const wide = board.querySelector('.tb-add-wide');
    wide.dataset.tbAdd = single ? state.filter : ''; wide.setAttribute('aria-label', single ? `${T('Add task for')} ${ownerLabel(state.filter)}` : T('Add task'));
    wide.style.setProperty('--member', single ? memberColor(state.filter) : 'var(--teal)');
    const filter = board.querySelector('.tb-filter'); filter.setAttribute('aria-label', T('Show profile'));
    filter.innerHTML = [['all', T('Everyone')], ...owners.map(owner => [owner, ownerLabel(owner)])].map(([value, text]) => {
      const open = value === 'all' || all ? null : tasksFor(value, date).filter(task => !isDone(task, key)).length;
      return `<button type="button" class="tb-chip tb-fchip" data-tb-filter="${esc(value)}" aria-pressed="${state.filter === value}" data-i18n-skip ${value !== 'all' ? `style="--member:${esc(memberColor(value))}"` : ''}>${value !== 'all' ? avatar(value, 'xs') : ''}<span>${esc(text)}</span>${open !== null && settings().showTaskCounts && open ? ` <b>${open}</b>` : ''}</button>`;
    }).join('');
    board.querySelector('.tb-mhead').innerHTML = single ? mobileHeadHtml(state.filter) : '';
    const visible = single ? [state.filter] : owners;
    const columns = board.querySelector('.tb-columns');
    columns.innerHTML = visible.map(columnHtml).join('');
    columns.classList.toggle('single', visible.length === 1);
    columns.style.setProperty('--cols', String(visible.length));
    board.style.setProperty('--member', single ? memberColor(state.filter) : 'var(--teal)');
  }

  window.jdOpenTasksBoard = async () => {
    ensureBoard();
    document.querySelectorAll('.routines-panel').forEach(panel => { panel.hidden = true; });
    board.hidden = false;
    renderBoard();
    await refresh();
  };
  // Hide the board whenever another destination opens (navigation.js stops propagation at document, so listen on window).
  window.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !board) return;
    const key = link.getAttribute('href').slice(1);
    if (['today', 'calendar', 'lists', 'school', 'more', 'treasures', 'meals'].includes(key)) board.hidden = true;
  }, true);

  // --- editor dialog --------------------------------------------------------------------------
  let dialog;
  function openEditor(task, presetOwner) {
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.className = 'jd-task-dialog'; dialog.dataset.i18nSkip = '';
      document.body.append(dialog);
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    }
    const info = task ? infoOf(task) : { emoji: '✅', category: 'day', coins: 1 };
    const owners = sortMembers(state.members);
    const owner = task ? (isGeneral(task) ? GENERAL : task.owner) : (presetOwner ?? owners[0] ?? GENERAL);
    const freq = !task?.recurrence ? 'none' : task.recurrence === 'daily' || !task.recurrenceDays?.length ? 'daily' : 'days';
    dialog.innerHTML = `<form method="dialog" class="jd-task-form">
      <div class="card-heading"><div><p class="eyebrow">${T(task ? 'EDIT TASK' : 'NEW TASK')}</p><h2>${T(task ? 'Edit task' : 'New task')}</h2></div><button type="button" class="jd-btn" data-close aria-label="${T('Close')}">×</button></div>
      <div class="jd-field"><label for="jd-task-title">${T('Title')}</label><span class="jd-combo"><input id="jd-task-title" name="title" maxlength="100" required autocomplete="off" value="${esc(task?.title ?? '')}" placeholder="${T('e.g. Brush teeth')}" data-i18n-skip ${task ? '' : 'role="combobox" aria-autocomplete="list" aria-controls="jd-task-suggestions" aria-expanded="false"'}>${task ? '' : `<button type="button" class="jd-combo-toggle" aria-label="${T('Show suggestions')}" aria-haspopup="listbox" aria-expanded="false" aria-controls="jd-task-suggestions"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><ul class="jd-combo-list" id="jd-task-suggestions" role="listbox" aria-label="${T('Suggestions')}" hidden></ul>`}</span></div>
      <fieldset class="jd-emoji-field"><legend>${T('Emoji')}</legend><input type="hidden" name="emoji" value="${esc(info.emoji)}"><div class="jd-emoji-grid">${[...new Set([info.emoji, ...EMOJIS])].map(e => `<button type="button" data-emoji="${esc(e)}" aria-pressed="${e === info.emoji}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div></fieldset>
      <label class="jd-field">${T('Who does it?')}<select name="owner" data-i18n-skip>${owners.map(name => `<option value="${esc(name)}" ${owner === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}<option value="${GENERAL}" ${owner === GENERAL ? 'selected' : ''}>${esc(T('General (no profile)'))}</option></select></label>
      <fieldset class="jd-seg"><legend>${T('Time of day')}</legend>${CATS.map(cat => `<label class="jd-seg-${cat.id}"><input type="radio" name="category" value="${cat.id}" ${info.category === cat.id ? 'checked' : ''}><span>${cat.icon} ${T(cat.label)}</span></label>`).join('')}</fieldset>
      <label class="jd-field">${T('Coins')}<input name="coins" type="number" min="0" max="50" value="${Number(info.coins) || 0}"></label>
      <fieldset class="jd-seg"><legend>${T('Repeat')}</legend>${[['none', 'Once'], ['daily', 'Daily'], ['days', 'On weekdays']].map(([value, label]) => `<label><input type="radio" name="frequency" value="${value}" ${freq === value ? 'checked' : ''}><span>${T(label)}</span></label>`).join('')}</fieldset>
      <div class="jd-days"${freq === 'days' ? '' : ' hidden'}>${DAYS.map(day => `<label><input type="checkbox" name="days" value="${day}" ${task?.recurrenceDays?.includes(day) ? 'checked' : ''}><span>${T(DAY_SHORT[day])}</span></label>`).join('')}</div>
      <div class="jd-task-actions">${task ? `<button type="button" class="jd-btn danger" data-delete>${T('Delete')}</button>` : ''}<span></span><button type="button" class="jd-btn" data-close>${T('Cancel')}</button><button type="submit" class="jd-btn primary">${T('Save')}</button></div>
    </form>`;
    const form = dialog.querySelector('form');
    form.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    form.querySelector('.jd-emoji-grid').addEventListener('click', event => {
      const pick = event.target.closest('[data-emoji]'); if (!pick) return;
      form.elements.emoji.value = pick.dataset.emoji;
      form.querySelectorAll('[data-emoji]').forEach(button => button.setAttribute('aria-pressed', String(button === pick)));
    });
    if (!task) wireSuggestions(form);
    form.querySelectorAll('[name="frequency"]').forEach(radio => radio.addEventListener('change', () => { form.querySelector('.jd-days').hidden = form.elements.frequency.value !== 'days'; }));
    form.querySelector('[data-delete]')?.addEventListener('click', () => removeTask(task));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = form.elements.title.value.trim(); if (!title) return;
      const frequency = form.elements.frequency.value;
      let recurrenceDays = frequency === 'days' ? [...form.querySelectorAll('[name="days"]:checked')].map(box => box.value) : [];
      if (frequency === 'days' && !recurrenceDays.length) recurrenceDays = [WEEK[new Date().getDay()]];
      const body = JSON.stringify({ title, owner: form.elements.owner.value, recurrence: frequency === 'none' ? null : frequency === 'daily' ? 'daily' : 'weekly', recurrenceDays });
      try {
        const response = await fetch(task ? `/api/tasks/${task.id}` : '/api/tasks', { method: task ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (!response.ok) throw new Error('save failed');
        const saved = await response.json();
        await X()?.ready?.();
        const meta = taskMeta();
        const category = form.elements.category.value || 'day';
        const coins = Math.max(0, Math.min(50, Number(form.elements.coins.value) || 0));
        const emoji = form.elements.emoji.value || '✅';
        const recent = task ? (X().get('taskMeta', {}).recent ?? []) : [{ title, emoji, category, coins }, ...(X().get('taskMeta', {}).recent ?? []).filter(item => String(item.title).toLowerCase() !== title.toLowerCase())].slice(0, RECENT_MAX * 2);
        await X().set('taskMeta', { ...X().get('taskMeta', {}), completions: meta.completions, recent, tasks: { ...meta.tasks, [saved.id]: { emoji, category, coins } } });
        dialog.close();
        say(task ? T('Task updated') : T('Task added'));
        window.loadSharedData?.();
        await refresh();
      } catch { say(T('Task could not be saved; retry when connected')); }
    });
    dialog.showModal();
    form.elements.title.focus();
  }

  function suggestions() {
    const presets = PRESETS.map(item => ({ ...item, title: T(item.title) }));
    const seen = new Set(presets.map(item => item.title.toLowerCase()));
    const stored = X()?.get?.('taskMeta', {})?.recent ?? [];
    const fromTasks = [...state.tasks].reverse().map(item => ({ title: item.title, ...infoOf(item) }));
    const recent = [];
    for (const item of [...stored, ...fromTasks]) {
      const title = String(item.title ?? '').trim(); const key = title.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key); recent.push({ title, emoji: item.emoji || '✅', category: item.category || 'day', coins: Number(item.coins) || 0 });
      if (recent.length >= RECENT_MAX) break;
    }
    return { presets, recent };
  }

  function wireSuggestions(form) {
    const input = form.elements.title; const toggleButton = form.querySelector('.jd-combo-toggle'); const list = form.querySelector('.jd-combo-list');
    if (!toggleButton || !list) return;
    const options = () => [...list.querySelectorAll('[role="option"]')];
    const setOpen = open => { list.hidden = !open; toggleButton.setAttribute('aria-expanded', String(open)); input.setAttribute('aria-expanded', String(open)); };
    const render = filtered => {
      const query = filtered ? input.value.trim().toLowerCase() : '';
      const { presets, recent } = suggestions();
      const keep = items => items.filter(item => !query || item.title.toLowerCase().includes(query));
      const groups = [[T('Suggestions'), keep(presets)], [T('Recently used'), keep(recent)]].filter(group => group[1].length);
      list.innerHTML = groups.length ? groups.map(([label, items]) => `<li role="presentation" class="jd-combo-head">${esc(label)}</li>${items.map(item => `<li role="option" tabindex="-1" data-pick="${esc(JSON.stringify(item))}"><span class="jd-combo-emoji" aria-hidden="true">${esc(item.emoji)}</span><span class="jd-combo-title">${esc(item.title)}</span><small><span aria-hidden="true">🪙</span> ${item.coins}<span class="sr-only"> ${T('coins')}</span></small></li>`).join('')}`).join('') : `<li role="presentation" class="jd-combo-empty">${T('No suggestions')}</li>`;
    };
    const pick = item => {
      input.value = item.title;
      form.elements.emoji.value = item.emoji;
      let button = [...form.querySelectorAll('[data-emoji]')].find(entry => entry.dataset.emoji === item.emoji);
      if (!button) { button = document.createElement('button'); button.type = 'button'; button.dataset.emoji = item.emoji; button.setAttribute('aria-label', item.emoji); button.textContent = item.emoji; form.querySelector('.jd-emoji-grid').prepend(button); }
      form.querySelectorAll('[data-emoji]').forEach(entry => entry.setAttribute('aria-pressed', String(entry === button)));
      const category = form.querySelector(`[name="category"][value="${item.category}"]`); if (category) category.checked = true;
      form.elements.coins.value = item.coins;
      setOpen(false); input.focus();
    };
    toggleButton.addEventListener('click', () => { if (list.hidden) { render(false); setOpen(true); } else setOpen(false); });
    input.addEventListener('input', () => { if (!list.hidden) render(true); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); render(false); setOpen(true); options()[0]?.focus(); }
      if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    });
    list.addEventListener('click', event => { const row = event.target.closest('[data-pick]'); if (row) pick(JSON.parse(row.dataset.pick)); });
    list.addEventListener('keydown', event => {
      const rows = options(); const index = rows.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); rows[Math.min(index + 1, rows.length - 1)]?.focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); if (index <= 0) input.focus(); else rows[index - 1].focus(); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const row = document.activeElement.closest('[data-pick]'); if (row) pick(JSON.parse(row.dataset.pick)); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); input.focus(); }
    });
    form.addEventListener('click', event => { if (!event.target.closest('.jd-combo')) setOpen(false); });
  }

  async function removeTask(task) {
    if (!window.confirm(`${T('Delete')} "${task.title}"?`)) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('delete failed');
      const meta = taskMeta(); const tasks = { ...meta.tasks }; const completions = { ...meta.completions };
      delete tasks[task.id]; delete completions[task.id];
      await X().set('taskMeta', { ...X().get('taskMeta', {}), tasks, completions });
      dialog?.close(); say(T('Task deleted')); window.loadSharedData?.(); await refresh();
    } catch { say(T('Task deletion unavailable; retry when connected')); }
  }

  // --- Today block ----------------------------------------------------------------------------
  function renderToday() {
    const list = document.querySelector('#task-list'); const card = list?.closest('.card');
    if (!card || !state.loaded) return;
    card.classList.add('jd-today-tasks-card');
    let host = card.querySelector('.jd-today-tasks');
    if (!host) {
      host = document.createElement('div'); host.className = 'jd-today-tasks'; host.dataset.i18nSkip = ''; list.after(host);
      host.addEventListener('click', event => {
        const toggleButton = event.target.closest('[data-task-toggle]'); if (!toggleButton) return;
        const task = state.tasks.find(item => item.id === toggleButton.dataset.taskToggle); if (task) toggle(task, new Date(), toggleButton);
      });
    }
    const date = new Date(); const key = dayKey(date); const s = settings();
    const rows = ownersToShow(date).map(owner => {
      const tasks = tasksFor(owner, date); if (!tasks.length) return '';
      const done = tasks.filter(task => isDone(task, key)).length;
      const shown = (s.hideDoneTasks ? tasks.filter(task => !isDone(task, key)) : tasks).sort((a, b) => CATS.findIndex(c => c.id === infoOf(a).category) - CATS.findIndex(c => c.id === infoOf(b).category));
      return `<section class="jd-today-row" style="--member:${esc(owner === GENERAL ? '#8a9aa3' : colorOf(owner))}"><header>${avatar(owner, 'sm')}<strong data-i18n-skip>${esc(ownerLabel(owner))}</strong>${owner !== GENERAL ? coin(balanceOf(owner), true) : ''}${ring(done, tasks.length, 34)}</header><div class="jd-today-chips">${shown.map(task => { const d = isDone(task, key); return `<button type="button" class="jd-today-task tb-cat-${esc(infoOf(task).category)}${d ? ' done' : ''}" data-task-toggle="${esc(task.id)}" aria-pressed="${d}" aria-label="${esc(`${T(d ? 'Reopen' : 'Complete')} ${task.title}`)}" data-i18n-skip><span aria-hidden="true">${esc(infoOf(task).emoji)}</span>${esc(task.title)}</button>`; }).join('') || `<span class="muted">✓ ${T('All done!')}</span>`}</div></section>`;
    }).join('');
    // Tasks captured while offline wait in offline-ui.js' queue; show them until they reach the server.
    let queued = [];
    try { queued = (JSON.parse(localStorage.getItem('jd-offline-queue') || '[]') || []).filter(entry => entry.url === '/api/capture' && entry.method === 'POST').map(entry => { try { return JSON.parse(entry.body); } catch { return null; } }).filter(body => body?.type === 'Task' && body.value && !state.tasks.some(task => task.title === body.value)); } catch { queued = []; }
    const pending = queued.length ? `<section class="jd-today-row jd-today-pending" style="--member:#8a9aa3"><header>${avatar(GENERAL, 'sm')}<strong>${T('waiting to sync')}</strong></header><div class="jd-today-chips">${queued.map(body => `<span class="jd-today-task"><span aria-hidden="true">⏳</span>${esc(body.value)}</span>`).join('')}</div></section>` : '';
    host.innerHTML = (pending + rows) || `<p class="muted empty-state">${T('No tasks for today. Add one under Tasks.')}</p>`;
  }

  function renderAll() { renderBoard(); renderToday(); window.dispatchEvent(new Event('jd-tasks-updated')); }

  // --- wiring ------------------------------------------------------------------------------------
  Object.assign(DE, {
    'done today': 'heute erledigt', 'Coin balance': 'Münzguthaben', 'Suggestions': 'Vorschläge', 'Recently used': 'Zuletzt eingegeben', 'Show suggestions': 'Vorschläge anzeigen', 'No suggestions': 'Keine Vorschläge',
    'Empty the dishwasher': 'Spülmaschine ausräumen', 'Fold laundry': 'Wäsche zusammenlegen', 'Sweep the stairs': 'Treppe fegen', 'Clean the bathroom': 'Bad putzen',
    '＋ New task': '＋ Neue Aufgabe', '＋ Add task': '＋ Aufgabe hinzufügen', 'New task': 'Neue Aufgabe', 'Edit task': 'Aufgabe bearbeiten', 'NEW TASK': 'NEUE AUFGABE', 'EDIT TASK': 'AUFGABE BEARBEITEN',
    'Morning': 'Morgens', 'Daytime': 'Tagsüber', 'Evening': 'Abends', 'Everyone': 'Alle', 'General (no profile)': 'Allgemein (ohne Profil)', 'General': 'Allgemein',
    'No tasks for this day.': 'Keine Aufgaben an diesem Tag.', 'All done!': 'Alles erledigt!', 'Previous day': 'Vorheriger Tag', 'Next day': 'Nächster Tag', 'Show profile': 'Profil anzeigen',
    'Time of day': 'Tageszeit', 'Coins': 'Münzen', 'coins': 'Münzen', 'Repeat': 'Wiederholen', 'Once': 'Einmalig', 'Daily': 'Täglich', 'On weekdays': 'An Wochentagen', 'Emoji': 'Emoji',
    'e.g. Brush teeth': 'z. B. Zähne putzen', 'done': 'erledigt', 'Task completed': 'Aufgabe erledigt', 'Task reopened': 'Aufgabe wieder geöffnet', 'Task added': 'Aufgabe hinzugefügt', 'Task updated': 'Aufgabe aktualisiert', 'Task deleted': 'Aufgabe gelöscht',
    'Task could not be saved; retry when connected': 'Aufgabe konnte nicht gespeichert werden; bitte erneut versuchen', 'No tasks for today. Add one under Tasks.': 'Heute keine Aufgaben. Lege welche unter Aufgaben an.',
    'View': 'Ansicht', 'Day': 'Tag', 'All tasks': 'Alle Aufgaben', 'No tasks yet.': 'Noch keine Aufgaben.', 'tasks': 'Aufgaben', 'waiting to sync': 'wartet auf Sync',
    'Mo': 'Mo', 'Tu': 'Di', 'We': 'Mi', 'Th': 'Do', 'Fr': 'Fr', 'Sa': 'Sa', 'Su': 'So',
    'Tasks & routines': 'Aufgaben & Routinen', 'Today': 'Heute', 'Close': 'Schließen', 'Title': 'Titel', 'Delete': 'Löschen', 'Cancel': 'Abbrechen', 'Save': 'Speichern', 'Edit': 'Bearbeiten',
    'Complete': 'Erledigen', 'Tomorrow': 'Morgen', 'Yesterday': 'Gestern', 'back to today': 'zurück zu heute', 'All times of day': 'Alle Tageszeiten', 'Nothing for this time of day.': 'Zu dieser Tageszeit nichts zu tun.', 'Show only': 'Nur anzeigen:', 'Add task for': 'Aufgabe hinzufügen für', 'Add task': 'Aufgabe hinzufügen', 'All profiles': 'Alle Profile', 'Show done tasks': 'Erledigte anzeigen', 'Hide done tasks': 'Erledigte ausblenden', 'Reopen': 'Wieder öffnen', 'Who does it?': 'Wer erledigt es?', 'Task deletion unavailable; retry when connected': 'Löschen nicht möglich; bitte erneut versuchen'
  });
  document.addEventListener('change', event => { if (event.target.id === 'language-select') setTimeout(renderAll, 0); });
  const subscribeAll = () => ['taskMeta', 'settings', 'profiles', 'coins'].forEach(key => X()?.subscribe(key, () => renderAll()));
  subscribeAll();
  const originalLoad = window.loadSharedData;
  if (typeof originalLoad === 'function' && !originalLoad.jdTasksWrapped) {
    const wrapped = async (...args) => { const result = await originalLoad(...args); refresh(); return result; };
    wrapped.jdTasksWrapped = true; window.loadSharedData = wrapped;
  }
  document.addEventListener('submit', event => { if (event.target.id === 'capture-form') { renderToday(); setTimeout(refresh, 400); } });
  window.addEventListener('online', () => setTimeout(refresh, 2500));
  let lastDay = dayKey();
  setInterval(() => { if (dayKey() !== lastDay) { lastDay = dayKey(); state.viewDate = new Date(); refresh(); } }, 60000);
  (X()?.ready?.() ?? Promise.resolve()).then(refresh);
  // What is due today per person (recurring tasks scheduled today + still-open one-time tasks), for the header avatars.
  const todayCounts = () => {
    if (!state.loaded) return null; const date = new Date(); const key = dayKey(date); const counts = {};
    for (const owner of state.members) { const tasks = tasksFor(owner, date); const done = tasks.filter(task => isDone(task, key)).length; counts[owner] = { total: tasks.length, open: tasks.length - done }; }
    return counts;
  };
  // Jump from a header avatar to the Tasks board, filtered to that person.
  const showMember = owner => { if (state.members.includes(owner)) state.filter = owner; document.querySelector('.tabs a[href="#tasks"]')?.click(); };
  window.jdTasks = { todayCounts, showMember, refresh, toggle: (id, date = new Date()) => { const task = state.tasks.find(item => item.id === id); return task ? toggle(task, date) : null; }, balanceOf, dayKey };
  if (location.hash === '#tasks') setTimeout(() => window.jdOpenTasksBoard(), 50);
})();
