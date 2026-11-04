(() => {
  const live = () => document.querySelector('#live-region');
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const t = key => (window.jdCalendarT ? window.jdCalendarT(key) : window.jdT ? window.jdT(key) : key);
  const startOfWeek = date => { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d; };
  const startOfDay = date => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const DEFAULT_START_HOUR = 6, DEFAULT_END_HOUR = 21, MIN_BLOCK_HEIGHT = 16, DEFAULT_DURATION_MIN = 60, DAY_MS = 86400000;
  const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const VIEWS = ['month', 'week', '5day', 'day', 'profiles'];
  let ROW_HEIGHT = 40;
  let START_HOUR = DEFAULT_START_HOUR, END_HOUR = DEFAULT_END_HOUR;
  // Profile colours that match a theme accent (--d-*) use the paired theme pastel (--p-*); others mix 78% white.
  const PASTEL_PAIRS = { '#f0a95a': 'var(--p-peach)', '#e88a98': 'var(--p-rose)', '#5cbd82': 'var(--p-mint)', '#4ab5ae': 'var(--p-teal)', '#8f8be0': 'var(--p-lav)', '#5b93e0': 'var(--p-sky)', '#e8c23c': 'var(--p-sun)', '#9aa4b2': 'var(--p-grey)' };
  const pastel = hex => { if (PASTEL_PAIRS[String(hex).toLowerCase()]) return PASTEL_PAIRS[String(hex).toLowerCase()];
    const n = parseInt(String(hex).slice(1), 16) || 0; const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const mix = c => Math.round(c + (255 - c) * 0.78); return `rgb(${mix(r)},${mix(g)},${mix(b)})`; };
  const loadHidden = () => { try { return new Set(JSON.parse(localStorage.getItem('jd-cal-hidden') || '[]')); } catch { return new Set(); } };
  // view/anchor/profile filter are per-viewer state; the default view comes from extras.settings.
  const state = { view: 'week', anchor: startOfDay(new Date()), hidden: loadHidden(), viewChosen: false };
  let panel;
  let detailDialog;
  let eventsById = new Map();
  let rawEvents = [];
  let connectionsList = [];
  let members = [];
  let defaultOwner = 'Shared';
  let renderSeq = 0;
  fetch('/api/household/demo').then(r => r.json()).then(h => { if (h?.members?.[0]) defaultOwner = h.members[0]; }).catch(() => {});

  const ownersOf = event => { const list = (Array.isArray(event.owners) && event.owners.length ? event.owners : [event.owner ?? 'Shared']).filter(Boolean); return list.length ? list : ['Shared']; };
  const profileColor = name => window.jdExtras?.get?.('profiles', {})?.[name]?.color ?? (window.jdMemberColor ? window.jdMemberColor(name) : '#00A6A9');
  const guard = (area, fn) => (window.jdLock?.guard ? window.jdLock.guard(area, fn) : fn());

  function eventEndTime(event) {
    const start = new Date(event.startsAt).getTime();
    const raw = event.endsAt ? new Date(event.endsAt).getTime() : NaN;
    if (!Number.isNaN(raw) && raw > start) return raw;
    return start + (event.allDay ? DAY_MS : DEFAULT_DURATION_MIN * 60000);
  }

  // Recurring events (daily/weekly/monthly/yearly, weekly with chosen weekdays such as Mon-Fri)
  // become one concrete occurrence per matching day inside [from, to).
  function expandEvents(events, from, to) {
    const out = [];
    for (const event of events) {
      const start = new Date(event.startsAt);
      if (Number.isNaN(start.getTime())) continue;
      const duration = eventEndTime(event) - start.getTime();
      const rule = event.recurrence;
      if (!['daily', 'weekly', 'monthly', 'yearly'].includes(rule)) { if (start < to && start.getTime() + duration > from.getTime()) out.push(event); continue; }
      const days = rule === 'weekly' && event.recurrenceDays?.length ? new Set(event.recurrenceDays) : null;
      const cursor = startOfDay(new Date(Math.max(start.getTime(), from.getTime() - duration)));
      for (let guardCount = 0; cursor < to && guardCount < 1000; guardCount++, cursor.setDate(cursor.getDate() + 1)) {
        const matches = rule === 'daily' || (rule === 'weekly' && (days ? days.has(DAY_CODES[cursor.getDay()]) : cursor.getDay() === start.getDay()))
          || (rule === 'monthly' && cursor.getDate() === start.getDate()) || (rule === 'yearly' && cursor.getDate() === start.getDate() && cursor.getMonth() === start.getMonth());
        if (!matches) continue;
        const occStart = new Date(cursor); occStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
        if (occStart < start) continue;
        const occEnd = new Date(occStart.getTime() + duration);
        if (occStart >= to || occEnd <= from) continue;
        out.push({ ...event, startsAt: occStart.toISOString(), endsAt: event.endsAt ? occEnd.toISOString() : null, occurrence: true });
      }
    }
    return out;
  }

  // Profile filter: an event stays visible while at least one of its household owners is shown;
  // events without a household owner ("Shared", synced calendars) are always visible.
  function visible(event) {
    const own = ownersOf(event).filter(name => members.includes(name));
    return !own.length || own.some(name => !state.hidden.has(name));
  }

  function connectionFor(event) {
    return connectionsList.find(item => event.providerId?.startsWith(`${item.id}-`));
  }

  // Colour by profile; several profiles render as diagonal stripes. Private calendars are grey "busy" blocks.
  function paint(event) {
    if (event.private) return { style: 'background:repeating-linear-gradient(135deg,#eef1f3 0 6px,#e1e6e9 6px 12px);border-left-color:#9aa7ad', cls: ' is-busy', colors: ['#9aa7ad'] };
    const connection = connectionFor(event);
    const colors = [...new Set(connection?.color ? [connection.color] : ownersOf(event).map(profileColor))];
    const background = colors.length > 1 ? `repeating-linear-gradient(135deg,${colors.map((c, i) => `${pastel(c)} ${i * 10}px ${(i + 1) * 10}px`).join(',')})` : pastel(colors[0]);
    return { style: `background:${background};border-left-color:${colors[0]}`, cls: colors.length > 1 ? ' is-multi' : '', colors };
  }

  // Smaller row minimum on phones would make blocks unreadable; there the page scrolls instead.
  const minRowHeight = () => (window.matchMedia?.('(max-width: 760px)').matches ? 40 : 18);

  function rangeFor(view = state.view, anchor = state.anchor) {
    if (view === 'month') { const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1); return { start: startOfWeek(first), count: 42 }; }
    if (view === 'week') return { start: startOfWeek(anchor), count: 7 };
    if (view === '5day') return { start: startOfDay(anchor), count: 5 };
    return { start: startOfDay(anchor), count: 1 };
  }

  // Anchor of the range `steps` ranges after the current one (used by the quick-jump pills).
  function shiftedAnchor(view, steps) {
    const a = state.anchor;
    if (view === 'month') return new Date(a.getFullYear(), a.getMonth() + steps, 1);
    return addDays(a, steps * (view === 'week' ? 7 : view === '5day' ? 5 : 1));
  }

  const fmtDayMonth = d => d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  function rangeLabel(start, count, view = state.view, anchor = state.anchor, short = false) {
    if (view === 'month') {
      const name = anchor.toLocaleDateString(undefined, { month: 'long' });
      return short && anchor.getFullYear() === new Date().getFullYear() ? name : `${name} '${String(anchor.getFullYear()).slice(-2)}`;
    }
    if (count === 1) return start.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' });
    return `${fmtDayMonth(start)} – ${fmtDayMonth(addDays(start, count - 1))}`;
  }

  const TITLES = { month: 'Month', week: 'Your household week', '5day': 'Next 5 days', day: 'Day', profiles: 'Profiles' };

  function holidaysFor(from, to) {
    const code = window.jdExtras?.get?.('settings', {})?.stateCode;
    const map = new Map();
    if (!code || !window.jdHolidays) return map;
    for (const holiday of window.jdHolidays.forRange(from, to, code)) map.set(holiday.date, [...(map.get(holiday.date) ?? []), holiday.name]);
    return map;
  }

  function blockTop(date) {
    const hourFrac = date.getHours() + date.getMinutes() / 60;
    const clamped = Math.min(Math.max(hourFrac, START_HOUR), END_HOUR - 1);
    return (clamped - START_HOUR) * ROW_HEIGHT;
  }

  // The part of an event that falls on one day. An event running past midnight or across
  // several days shows its portion on each day; nothing goes before 00:00 or past 24:00.
  function segmentFor(event, day) {
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const eventStart = new Date(event.startsAt);
    const rawEnd = event.endsAt ? new Date(event.endsAt) : null;
    const wantedEnd = rawEnd && !Number.isNaN(rawEnd.getTime()) ? rawEnd.getTime() : eventStart.getTime() + DEFAULT_DURATION_MIN * 60000;
    const eventEnd = new Date(Math.max(wantedEnd, eventStart.getTime() + 15 * 60000));
    if (eventStart >= dayEnd || eventEnd <= dayStart) return null;
    const start = eventStart > dayStart ? eventStart : dayStart;
    const end = eventEnd < dayEnd ? eventEnd : dayEnd;
    return { event, start, end, endsAtDayEnd: end.getTime() >= dayEnd.getTime() };
  }

  const allDayOn = (event, day) => { const dayStart = startOfDay(day).getTime(); const start = new Date(event.startsAt).getTime(); return start < dayStart + DAY_MS && eventEndTime(event) > dayStart; };

  function blockHeight(segment) {
    return Math.max(((segment.end - segment.start) / 3600000) * ROW_HEIGHT, MIN_BLOCK_HEIGHT);
  }

  // Overlapping segments share a cluster and sit side by side in lanes instead of stacking,
  // so every block keeps its real start time.
  function assignLanes(segments) {
    const sorted = [...segments].sort((a, b) => a.start - b.start || b.end - a.end);
    const clusters = [];
    let cluster = [], clusterEnd = null;
    for (const segment of sorted) {
      if (clusterEnd && segment.start >= clusterEnd) { clusters.push(cluster); cluster = []; clusterEnd = null; }
      cluster.push(segment);
      if (!clusterEnd || segment.end > clusterEnd) clusterEnd = segment.end;
    }
    if (cluster.length) clusters.push(cluster);
    for (const members of clusters) {
      const laneEnds = [];
      for (const segment of members) {
        let lane = laneEnds.findIndex(end => segment.start >= end);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(segment.end); } else laneEnds[lane] = segment.end;
        segment.lane = lane;
      }
      for (const segment of members) segment.lanes = laneEnds.length;
    }
    return sorted;
  }

  function isPast(event) {
    const end = new Date(event.endsAt || event.startsAt);
    return !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
  }

  const REPEAT_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
  function repeatLabel(event) {
    if (!REPEAT_LABELS[event.recurrence]) return '';
    if (event.recurrence === 'weekly' && event.recurrenceDays?.length) return event.recurrenceDays.map(day => t(day)).join(', ');
    return t(REPEAT_LABELS[event.recurrence]);
  }

  function formatRange(event) {
    const dayFmt = d => d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' });
    // German header reads "Mo. 26" (reference); keep the locale form elsewhere.
  const weekdayShort = d => { const w = d.toLocaleDateString(undefined, { weekday: 'short' }); return (window.jdLanguage?.() ?? 'de') === 'de' && !w.endsWith('.') ? `${w}.` : w; };
  const timeFmt = d => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const start = new Date(event.startsAt);
    if (event.allDay) { const last = new Date(eventEndTime(event) - 1); return sameDay(start, last) ? dayFmt(start) : `${dayFmt(start)} – ${dayFmt(last)}`; }
    const end = event.endsAt ? new Date(event.endsAt) : null;
    if (!end || Number.isNaN(end.getTime())) return `${dayFmt(start)} · ${timeFmt(start)}`;
    if (sameDay(start, end)) return `${dayFmt(start)} · ${timeFmt(start)}–${timeFmt(end)}`;
    return `${dayFmt(start)} ${timeFmt(start)} – ${dayFmt(end)} ${timeFmt(end)}`;
  }

  function ensureDetailDialog() {
    if (detailDialog) return detailDialog;
    detailDialog = document.createElement('dialog');
    detailDialog.className = 'event-detail-dialog';
    detailDialog.innerHTML = `<div class="event-detail-body">
      <button type="button" class="close" data-detail-close aria-label="Close">×</button>
      <div class="event-detail-head"><span class="event-detail-swatch" data-detail-swatch aria-hidden="true"></span><h3 data-detail-title data-i18n-skip></h3></div>
      <p class="event-detail-row" data-detail-range data-i18n-skip></p>
      <p class="event-detail-row" data-detail-repeat hidden data-i18n-skip></p>
      <p class="event-detail-row event-detail-owners" data-detail-owner data-i18n-skip></p>
      <p class="event-detail-row" data-detail-location hidden data-i18n-skip></p>
      <p class="event-detail-description" data-detail-description hidden data-i18n-skip></p>
      <p class="event-detail-note" data-detail-private hidden>This calendar is shared privately: only busy times are shown, without title or details.</p>
      <p class="event-detail-note" data-detail-source hidden data-i18n-skip></p>
      <div class="inline-actions"><button type="button" class="jd-btn primary" data-detail-edit>Edit</button><button type="button" class="jd-btn cal-btn-soft" data-detail-delete>Delete event</button></div>
    </div>`;
    document.body.append(detailDialog);
    detailDialog.querySelector('[data-detail-close]').addEventListener('click', () => detailDialog.close());
    detailDialog.addEventListener('click', e => { if (e.target === detailDialog) detailDialog.close(); });
    detailDialog.querySelector('[data-detail-edit]').addEventListener('click', () => {
      const event = eventsById.get(detailDialog.dataset.providerId);
      if (!event || event.private || !window.jdOpenEventEditor) return;
      detailDialog.close();
      window.jdOpenEventEditor(event);
    });
    detailDialog.querySelector('[data-detail-delete]').addEventListener('click', () => guard('events', async () => {
      const providerId = detailDialog.dataset.providerId;
      if (!providerId || !window.confirm(window.jdT ? window.jdT('Delete this event?') : 'Delete this event?')) return;
      const response = await fetch(`/api/calendar/events/${encodeURIComponent(providerId)}`, { method: 'DELETE' });
      if (response.ok) { live().textContent = 'Calendar event deleted'; detailDialog.close(); render(); }
    }));
    return detailDialog;
  }

  function openDetail(providerId, occurrenceStart, occurrenceEnd) {
    const series = eventsById.get(providerId);
    if (!series) return;
    const event = occurrenceStart ? { ...series, startsAt: occurrenceStart, endsAt: occurrenceEnd || series.endsAt } : series;
    const dialog = ensureDetailDialog();
    dialog.dataset.providerId = providerId;
    dialog.querySelector('[data-detail-title]').textContent = event.private ? t('Busy') : event.title;
    dialog.querySelector('[data-detail-range]').textContent = formatRange(event);
    const repeatEl = dialog.querySelector('[data-detail-repeat]');
    const repeat = repeatLabel(event);
    repeatEl.hidden = !repeat;
    repeatEl.textContent = repeat ? `🔁 ${repeat}` : '';
    const owners = ownersOf(event);
    const look = paint(event);
    dialog.querySelector('[data-detail-swatch]').setAttribute('style', look.style);
    dialog.querySelector('[data-detail-owner]').innerHTML = `<span class="sr-only">${esc(t(owners.length > 1 ? 'Profiles' : 'Owner'))}: </span>${owners.map(name => `<span class="event-detail-owner">${name === 'Shared' ? '<span class="cal-avatar is-shared" aria-hidden="true">∗</span>' : avatarHtml(name)}<span>${esc(name === 'Shared' ? t('Shared') : name)}</span></span>`).join('')}`;
    const locationEl = dialog.querySelector('[data-detail-location]');
    locationEl.hidden = !event.location;
    if (event.location) locationEl.textContent = `📍 ${event.location}`;
    const descriptionEl = dialog.querySelector('[data-detail-description]');
    descriptionEl.hidden = !event.description;
    descriptionEl.textContent = event.description ?? '';
    dialog.querySelector('[data-detail-private]').hidden = !event.private;
    dialog.querySelector('[data-detail-edit]').hidden = Boolean(event.private) || !window.jdOpenEventEditor;
    dialog.querySelector('[data-detail-delete]').hidden = Boolean(event.private);
    const sourceEl = dialog.querySelector('[data-detail-source]');
    const connection = connectionFor(event);
    // Deleting here never deletes the event upstream (the app only reads from connected
    // calendars) -- surface that right where someone would otherwise expect it to sync.
    sourceEl.hidden = !connection || Boolean(event.private);
    if (connection) sourceEl.textContent = `Synced from ${connection.label}. Deleting it here only removes it from this view -- it comes back on the next sync, and won't be deleted from ${connection.label} itself.`;
    dialog.showModal();
  }

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });

  const initial = name => esc(String(name ?? '?').trim().charAt(0).toUpperCase() || '?');
  // Small letter badges (profile initial in the profile colour) -- the owner is readable without relying on colour.
  const badges = event => (event.private ? '' : `<span class="week-badges" aria-hidden="true">${ownersOf(event).slice(0, 3).map(name => `<span class="week-badge" style="background:${esc(name === 'Shared' ? '#9aa4b2' : profileColor(name))}" title="${esc(name)}">${initial(name === 'Shared' ? t('Shared') : name)}</span>`).join('')}</span>`);
  // German header reads "Mo. 26" (reference); keep the locale form elsewhere.
  const weekdayShort = d => { const w = d.toLocaleDateString(undefined, { weekday: 'short' }); return (window.jdLanguage?.() ?? 'de') === 'de' && !w.endsWith('.') ? `${w}.` : w; };
  const timeFmt = d => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const chipHtml = (event, extraClass = '') => { const look = paint(event); return `<span class="week-allday-chip${extraClass}${look.cls}${isPast(event) ? ' is-past' : ''}" role="button" tabindex="0" data-provider-id="${esc(event.providerId)}" data-start="${esc(event.startsAt)}" data-end="${esc(event.endsAt ?? '')}" style="${look.style}">${event.eventType === 'birthday' ? '🎂 ' : ''}<span data-i18n-skip>${esc(event.private ? t('Busy') : event.title)}</span>${badges(event)}</span>`; };
  const holidayChips = names => names.map(name => `<span class="week-allday-chip cal-holiday" title="${esc(name)}" data-i18n-skip>★ ${esc(name)}</span>`).join('');
  const moonChips = moons => moons.map(m => { const l = window.jdMoonLabel(m); return `<span class="week-allday-chip week-moon week-moon-${m.type}" title="${l.time}" data-i18n-skip>${l.icon} ${l.name} · ${l.time}</span>`; }).join('');
  const avatarHtml = name => { const photo = window.jdExtras?.get?.('profiles', {})?.[name]?.photo; return `<span class="cal-avatar" style="--chip-color:${esc(profileColor(name))}">${photo ? `<img src="${esc(photo)}" alt="">` : initial(name)}</span>`; };

  // Red "now" line in today's column; repositioned every minute, full re-render when the day changes.
  let renderedDay = dayKey(new Date());
  function placeNowLine() {
    const line = panel?.querySelector('.week-now');
    if (!line) return;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    line.hidden = hour < START_HOUR || hour >= END_HOUR;
    line.style.top = `${(hour - START_HOUR) * ROW_HEIGHT}px`;
  }
  setInterval(() => { if (!panel || panel.hidden) return; if (dayKey(new Date()) !== renderedDay) render(); else placeNowLine(); }, 60000);

  function renderRangePills(view) {
    const box = panel.querySelector('.cal-range-next');
    if (!box) return;
    box.innerHTML = [1, 2].map(step => {
      const anchor = shiftedAnchor(view, step);
      const range = rangeFor(view, anchor);
      return `<button type="button" class="cal-range-pill" data-range-jump="${dayKey(anchor)}" data-i18n-skip>${esc(rangeLabel(range.start, range.count, view, anchor, true))}</button>`;
    }).join('');
  }

  async function render() {
    if (!panel || panel.hidden) return;
    const seq = ++renderSeq;
    const [events, connections, household] = await Promise.all([
      fetch('/api/calendar/events?limit=5000').then(r => r.json()).catch(() => []),
      fetch('/api/provider-connections').then(r => r.json()).catch(() => []),
      fetch('/api/household/demo').then(r => r.json()).catch(() => null)
    ]);
    if (seq !== renderSeq || panel.hidden) return;
    rawEvents = Array.isArray(events) ? events : [];
    eventsById = new Map(rawEvents.map(event => [event.providerId, event]));
    connectionsList = Array.isArray(connections) ? connections : [];
    const profiles = window.jdExtras?.get?.('profiles', {}) ?? {};
    members = [...(household?.members ?? [])].sort((a, b) => (profiles[a]?.order ?? 999) - (profiles[b]?.order ?? 999));
    if (members[0]) defaultOwner = members[0];
    if (!VIEWS.includes(state.view)) state.view = 'week';
    // Month needs public/features/calendar-views.js; until it has loaded, show the week (it re-renders on load).
    const view = state.view === 'month' && !window.jdCalendarViews?.month ? 'week' : state.view;
    window.jdCalendarViews?.toolbar?.(panel, api);

    const today = new Date();
    renderedDay = dayKey(today);
    const { start, count } = rangeFor(view);
    const days = [...Array(count)].map((_, i) => addDays(start, i));
    const rangeEnd = addDays(start, count);
    const expanded = expandEvents(rawEvents, start, rangeEnd).filter(visible);
    const holidays = holidaysFor(start, rangeEnd);
    const moons = window.jdMoonEnabled?.() && window.jdMoonPhases ? window.jdMoonPhases(start, rangeEnd) : [];
    panel.dataset.view = view;
    panel.querySelector('.week-range').textContent = rangeLabel(start, count, view);
    renderRangePills(view);
    panel.querySelector('.cal-title').textContent = t(TITLES[view]);
    const grid = panel.querySelector('.week-grid');
    grid.className = `week-grid cal-view-${view}`;

    if (view === 'month') {
      window.jdCalendarViews.month(grid, { days, events: expanded, holidays, moons, today, anchor: state.anchor });
      return;
    }

    // Timeline columns: one per day, or one per profile for the profiles view.
    const shownMembers = members.filter(name => !state.hidden.has(name));
    const sharedOnly = event => !ownersOf(event).some(name => members.includes(name));
    const spanShared = view === 'profiles' && shownMembers.length > 0;
    const columns = view === 'profiles'
      ? [...shownMembers.map(name => ({ date: days[0], owner: name, filter: event => ownersOf(event).includes(name) })), ...(shownMembers.length ? [] : [{ date: days[0], owner: null, label: 'Shared', filter: event => sharedOnly(event) }])]
      : days.map(date => ({ date, owner: null, filter: () => true }));
    const allDayEvents = expanded.filter(e => e.allDay);
    const timedEvents = expanded.filter(e => !e.allDay && !Number.isNaN(new Date(e.startsAt).getTime()));
    const sharedAllDay = spanShared ? allDayEvents.filter(event => sharedOnly(event) && allDayOn(event, days[0])) : [];
    const sharedSegments = spanShared ? timedEvents.filter(sharedOnly).map(event => segmentFor(event, days[0])).filter(Boolean) : [];
    const sharedStrip = sharedAllDay.length ? `<div class="week-shared-strip"><span class="cal-avatar is-shared" aria-hidden="true">∗</span><span class="week-shared-label">${esc(t('Shared'))}</span>${sharedAllDay.map(event => chipHtml(event)).join('')}</div>` : '';
    const colAllDay = columns.map(col => allDayEvents.filter(e => col.filter(e) && allDayOn(e, col.date)));
    const colExtras = columns.map((col, i) => (view === 'profiles' && i > 0 ? '' : holidayChips(holidays.get(dayKey(col.date)) ?? []) + moonChips(moons.filter(m => sameDay(m.at, col.date)))));
    const colSegments = columns.map(col => timedEvents.filter(col.filter).map(event => segmentFor(event, col.date)).filter(Boolean));
    const eventHours = [...colSegments.flat(), ...sharedSegments].flatMap(segment => [segment.start.getHours() + segment.start.getMinutes() / 60, segment.endsAtDayEnd ? 24 : segment.end.getHours() + segment.end.getMinutes() / 60]);
    START_HOUR = Math.max(0, Math.floor(Math.min(DEFAULT_START_HOUR, ...(eventHours.length ? eventHours : [DEFAULT_START_HOUR]))));
    END_HOUR = Math.min(24, Math.ceil(Math.max(DEFAULT_END_HOUR, ...(eventHours.length ? eventHours : [DEFAULT_END_HOUR]))));

    const headerFor = (col, i) => {
      const d = col.date;
      const label = col.owner || col.label
        ? `${col.owner ? avatarHtml(col.owner) : '<span class="cal-avatar is-shared" aria-hidden="true">∗</span>'}<span class="week-weekday cal-profile-name" data-i18n-skip>${esc(col.owner ?? t(col.label))}</span>`
        : `<span class="week-weekday">${esc(weekdayShort(d))}</span><span class="week-daynum">${d.getDate()}</span>`;
      return `<header>${label}<button type="button" class="week-add" data-day-index="${i}" aria-label="${esc(t('New event'))}">+</button></header>`;
    };

    // Event blocks for one column (or for the layer that spans all profile columns).
    const blocksHtml = (segments, bodyHeight, extraCls) => assignLanes(segments).map(segment => {
        const { event } = segment;
        const look = paint(event);
        const top = Math.min(blockTop(segment.start), bodyHeight - MIN_BLOCK_HEIGHT);
        const height = Math.min(blockHeight(segment), bodyHeight - top);
        const left = (segment.lane / segment.lanes) * 100, right = ((segment.lanes - segment.lane - 1) / segment.lanes) * 100;
        const size = height < 26 ? ' is-tiny' : height < 40 ? ' is-short' : '';
        const sub = event.private ? (connectionFor(event)?.label ?? '') : `${timeFmt(segment.start)} – ${segment.endsAtDayEnd ? '24:00' : timeFmt(segment.end)}`;
        return `<article class="week-event${look.cls}${extraCls}${size}${isPast(event) ? ' is-past' : ''}${event.occurrence ? ' is-recurring' : ''}" role="button" tabindex="0" data-provider-id="${esc(event.providerId)}" data-start="${esc(event.startsAt)}" data-end="${esc(event.endsAt ?? '')}" style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);right:calc(${right}% + 2px);${look.style}"><strong data-i18n-skip>${esc(event.private ? t('Busy') : event.title)}</strong><small data-i18n-skip>${esc(sub)}</small>${badges(event)}</article>`;
    }).join('');
    // Each body is built for a given hour-row height; the first pass (height 0) measures the
    // header + all-day area so the hour rows can fill the remaining panel height without scrolling.
    const columnsHtml = (rowHeight, allDayHeight) => columns.map((col, i) => {
      const isToday = view !== 'profiles' && sameDay(col.date, today);
      const bodyHeight = (END_HOUR - START_HOUR) * rowHeight;
      const blocks = rowHeight ? blocksHtml(colSegments[i], bodyHeight, '') : '';
      const now = isToday && rowHeight ? '<div class="week-now" aria-hidden="true"></div>' : '';
      const alldayStyle = allDayHeight ? ` style="min-height:${allDayHeight}px"` : '';
      return `<div class="week-day-col${isToday ? ' is-today' : ''}">${headerFor(col, i)}<div class="week-allday-cell"${alldayStyle}>${colExtras[i]}${colAllDay[i].map(event => chipHtml(event)).join('')}</div><div class="week-day-body" style="height:${bodyHeight}px;--row:${rowHeight}px">${blocks}${now}<form class="week-quick-add" data-day-index="${i}" hidden><input type="text" name="title" maxlength="100" required placeholder="${esc(t('Title'))}" aria-label="${esc(t('Title'))}"><input type="time" name="time" value="09:00" required aria-label="${esc(t('Starts'))}"><button type="submit">${esc(t('Save'))}</button>${window.jdOpenEventEditor ? `<button type="button" class="cal-more-options" data-more-options>${esc(t('More options'))}</button>` : ''}</form></div></div>`;
    }).join('');
    const hours = [...Array(END_HOUR - START_HOUR)].map((_, i) => START_HOUR + i);
    const axisHtml = (rowHeight, headHeight) => `<div class="week-axis"><div class="week-axis-spacer" style="height:${headHeight || 0}px"></div><div class="week-axis-body" style="height:${(END_HOUR - START_HOUR) * rowHeight}px">${hours.map((h, i) => `<span class="week-axis-label" style="top:${i * rowHeight}px">${h}</span>`).join('')}</div></div>`;

    grid.innerHTML = `${sharedStrip}<div class="week-hour-row">${axisHtml(0, 0)}${columnsHtml(0, 0)}</div>`;
    const allDayHeight = Math.max(0, ...[...grid.querySelectorAll('.week-allday-cell')].map(cell => cell.offsetHeight));
    grid.querySelectorAll('.week-allday-cell').forEach(cell => { cell.style.minHeight = `${allDayHeight}px`; });
    const firstBody = grid.querySelector('.week-day-body');
    const bodyTop = firstBody ? firstBody.getBoundingClientRect().top : 0;
    const headHeight = firstBody ? bodyTop - grid.querySelector('.week-day-col').getBoundingClientRect().top : 0;
    const available = panel.getBoundingClientRect().bottom - bodyTop - 12;
    ROW_HEIGHT = Math.max(minRowHeight(), Math.floor(available / (END_HOUR - START_HOUR)));

    grid.innerHTML = `${sharedStrip}<div class="week-hour-row">${axisHtml(ROW_HEIGHT, headHeight)}${columnsHtml(ROW_HEIGHT, allDayHeight)}</div>`;
    const hourRow = grid.querySelector('.week-hour-row'); const bodies = [...grid.querySelectorAll('.week-day-body')];
    if (sharedSegments.length && bodies.length) {
      const rowRect = hourRow.getBoundingClientRect(); const first = bodies[0].getBoundingClientRect(); const last = bodies[bodies.length - 1].getBoundingClientRect();
      const layer = document.createElement('div'); layer.className = 'week-shared-layer';
      layer.style.cssText = `left:${first.left - rowRect.left}px;width:${last.right - first.left}px;top:${first.top - rowRect.top}px;height:${first.height}px`;
      layer.innerHTML = blocksHtml(sharedSegments, first.height, ' is-shared-span'); hourRow.append(layer);
    }
    placeNowLine();

    panel.querySelectorAll('.week-add').forEach(button => button.addEventListener('click', () => {
      const form = panel.querySelector(`.week-quick-add[data-day-index="${button.dataset.dayIndex}"]`);
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('input').focus();
    }));
    panel.querySelectorAll('[data-more-options]').forEach(button => button.addEventListener('click', () => {
      const form = button.closest('form');
      const col = columns[Number(form.dataset.dayIndex)];
      const [hour, minute] = (form.elements.time.value || '09:00').split(':').map(Number);
      const startsAt = new Date(col.date); startsAt.setHours(hour, minute, 0, 0);
      form.hidden = true;
      window.jdOpenEventEditor({ title: form.elements.title.value, startsAt: startsAt.toISOString(), owners: [col.owner ?? defaultOwner] });
    }));
    panel.querySelectorAll('.week-quick-add').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      const target = e.currentTarget;
      guard('events', async () => {
        const value = Object.fromEntries(new FormData(target));
        const col = columns[Number(target.dataset.dayIndex)];
        const [hour, minute] = value.time.split(':').map(Number);
        const startsAt = new Date(col.date); startsAt.setHours(hour, minute, 0, 0);
        const response = await fetch('/api/calendar/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: value.title, startsAt: startsAt.toISOString(), owner: col.owner ?? defaultOwner }) });
        if (response.ok) { live().textContent = 'Event added'; render(); } else { live().textContent = 'Event could not be saved'; }
      });
    }));
  }

  function setView(view, date) {
    if (!VIEWS.includes(view)) return;
    state.view = view; state.viewChosen = true;
    if (date) state.anchor = startOfDay(date);
    return render();
  }
  function shift(direction) {
    const a = state.anchor;
    if (state.view === 'month') state.anchor = new Date(a.getFullYear(), a.getMonth() + direction, 1);
    else state.anchor = addDays(a, direction * (state.view === 'week' ? 7 : state.view === '5day' ? 5 : 1));
    return render();
  }
  function goToday() { state.anchor = startOfDay(new Date()); return render(); }
  function setHidden(name, hidden) {
    if (hidden) state.hidden.add(name); else state.hidden.delete(name);
    try { localStorage.setItem('jd-cal-hidden', JSON.stringify([...state.hidden])); } catch { /* per-viewer convenience only */ }
    render();
  }

  const api = {
    state, render, setView, shift, goToday, setHidden, openDetail, expand: expandEvents, paint, ownersOf, profileColor, isPast, esc, dayKey, startOfDay, addDays, sameDay, eventEndTime, allDayOn,
    members: () => members, events: () => rawEvents, defaultOwner: () => defaultOwner, chipHtml, holidayChips, moonChips, t
  };
  window.jdCalendar = api;
  window.jdExpandEvents = expandEvents;

  // Initial view from the household settings until the viewer picks one themselves.
  const applyDefaultView = settings => {
    const wanted = settings?.defaultCalendarView;
    if (!state.viewChosen && VIEWS.includes(wanted) && wanted !== state.view) { state.view = wanted; window.jdRefreshCalendarWeek(); }
  };
  const hookSettings = () => { if (!window.jdExtras || hookSettings.done) return; hookSettings.done = true; window.jdExtras.subscribe('settings', settings => { applyDefaultView(settings); window.jdRefreshCalendarWeek(); }); window.jdExtras.subscribe('profiles', () => window.jdRefreshCalendarWeek()); applyDefaultView(window.jdExtras.get('settings', {})); };

  window.jdRefreshCalendarWeek = () => { if (panel && !panel.hidden) render(); };

  window.jdOpenCalendarWeek = () => {
    document.querySelector('.shell')?.classList.add('shell-wide');
    hookSettings();
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'card calendar-week-panel';
      const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
      // Toolbar sits directly under the top bar (no title block): view pills (calendar-views.js), Today, prev/next,
      // the current range as a blue pill and the next two ranges as grey quick-jump pills.
      panel.innerHTML = `<h2 class="cal-title sr-only" data-i18n-skip>${esc(t(TITLES.week))}</h2><div class="cal-bar"><div class="week-nav cal-nav" data-i18n-skip><button type="button" class="cal-icon-btn cal-today" data-week="today" aria-label="${esc(t('Today'))}" title="${esc(t('Today'))}">${icon('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>')}</button><button type="button" class="cal-icon-btn cal-step" data-week="prev" aria-label="${esc(t('Previous'))}">${icon('<path d="M14.5 6 8.5 12l6 6"/>')}</button><button type="button" class="cal-icon-btn cal-step" data-week="next" aria-label="${esc(t('Next'))}">${icon('<path d="m9.5 6 6 6-6 6"/>')}</button><span class="cal-range-pills"><span class="week-range cal-range-pill is-active" aria-live="polite" data-i18n-skip></span><span class="cal-range-next"></span></span></div><div class="calendar-toolbar"></div></div><div class="week-grid"></div>`;
      document.querySelector('.shell').append(panel);
      panel.querySelector('[data-week="prev"]').addEventListener('click', () => shift(-1));
      panel.querySelector('[data-week="next"]').addEventListener('click', () => shift(1));
      panel.querySelector('[data-week="today"]').addEventListener('click', goToday);
      panel.querySelector('.cal-range-next').addEventListener('click', e => {
        const pill = e.target.closest('[data-range-jump]');
        if (!pill) return;
        const [y, m, d] = pill.dataset.rangeJump.split('-').map(Number);
        state.anchor = new Date(y, m - 1, d);
        render();
      });
      const openBlock = block => openDetail(block.dataset.providerId, block.dataset.start, block.dataset.end);
      panel.addEventListener('click', e => {
        const block = e.target.closest('.week-event, .week-allday-chip[data-provider-id], .cal-month-chip[data-provider-id]');
        if (block) openBlock(block);
      });
      panel.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const block = e.target.closest('.week-event, .week-allday-chip[data-provider-id]');
        if (block) { e.preventDefault(); openBlock(block); }
      });
    }
    panel.hidden = false;
    render();
  };
})();
