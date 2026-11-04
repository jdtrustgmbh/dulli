// Calendar views: view switcher (month/week/5-day/day/profiles), profile filter, search, holiday region,
// month grid and the full event editor. The timeline itself lives in calendar-week-ui.js (window.jdCalendar).
(() => {
  const DE = {
    Month: 'Monat', Week: 'Woche', '5 days': '5 Tage', Day: 'Tag', Profiles: 'Profile', 'Next 5 days': 'Nächste 5 Tage', 'Your household week': 'Eure Haushaltswoche',
    Today: 'Heute', Busy: 'Belegt', Owner: 'Zuständig', Shared: 'Gemeinsam', Edit: 'Bearbeiten', Daily: 'Täglich', Weekly: 'Wöchentlich', Monthly: 'Monatlich', Yearly: 'Jährlich',
    Mon: 'Mo', Tue: 'Di', Wed: 'Mi', Thu: 'Do', Fri: 'Fr', Sat: 'Sa', Sun: 'So', 'Mon–Fri': 'Mo–Fr',
    'Calendar view': 'Kalenderansicht', 'Show or hide profiles': 'Profile ein- oder ausblenden', 'Search events': 'Termine suchen', 'No matching events': 'Keine passenden Termine',
    Region: 'Region', 'Public holidays': 'Feiertage', 'No holidays': 'Keine Feiertage', 'more': 'weitere',
    'New event': 'Neuer Termin', 'Edit event': 'Termin bearbeiten', Title: 'Titel', Description: 'Beschreibung', Location: 'Ort', 'All day': 'Ganztägig',
    Starts: 'Beginn', Ends: 'Ende', Repeat: 'Wiederholen', 'Does not repeat': 'Keine Wiederholung', 'Custom weekdays': 'Bestimmte Wochentage',
    Reminder: 'Erinnerung', 'No reminder': 'Keine Erinnerung', 'At start time': 'Zum Beginn', '5 minutes before': '5 Minuten vorher', '15 minutes before': '15 Minuten vorher',
    '30 minutes before': '30 Minuten vorher', '1 hour before': '1 Stunde vorher', '1 day before': '1 Tag vorher', 'Save': 'Speichern', Cancel: 'Abbrechen', 'Delete event': 'Termin löschen',
    'Calendar event added': 'Termin hinzugefügt', 'Calendar event updated': 'Termin aktualisiert', 'Calendar event could not be saved': 'Termin konnte nicht gespeichert werden',
    'Pick at least one weekday': 'Mindestens einen Wochentag wählen', 'Delete this event?': 'Diesen Termin löschen?', 'More options': 'Weitere Optionen',
    'Previous': 'Zurück', 'Next': 'Weiter', 'Calendar event deleted': 'Termin gelöscht',
    'This calendar is shared privately: only busy times are shown, without title or details.': 'Dieser Kalender ist privat verbunden: Es werden nur belegte Zeiten angezeigt, ohne Titel oder Details.',
    'Private: only busy times are shown, without title or details': 'Privat: Es werden nur belegte Zeiten angezeigt, ohne Titel oder Details',
    'Calendar is private: only busy times are shown': 'Kalender ist privat: Es werden nur belegte Zeiten angezeigt',
    'Calendar details are shown again': 'Kalenderdetails werden wieder angezeigt', 'Privacy setting could not be saved': 'Privatsphäre-Einstellung konnte nicht gespeichert werden'
  };
  const lang = () => (window.jdLanguage ? window.jdLanguage() : 'de');
  const t = key => (lang() === 'de' ? DE[key] ?? window.jdT?.(key) ?? key : key);
  window.jdCalendarT = t;
  // Only multi-word phrases go into the global dictionary: it replaces substrings in every text node.
  window.jdI18nExtend?.({ ...Object.fromEntries(Object.entries(DE).filter(([key]) => key.includes(' ') && key.length > 9)), Private: 'Privat' });

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const live = text => { const region = document.querySelector('#live-region'); if (region) region.textContent = text; };
  const guard = (area, fn) => (window.jdLock?.guard ? window.jdLock.guard(area, fn) : fn());
  const cal = () => window.jdCalendar;
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
    flag: svg('<path d="M5 21V4.5M5 5c2.5-1.5 5-1.5 7 0s4.5 1.5 7 0v8.5c-2.5 1.5-5 1.5-7 0s-4.5-1.5-7 0"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>')
  };
  const VIEW_LABELS = [['month', 'Month'], ['week', 'Week'], ['5day', '5 days'], ['day', 'Day'], ['profiles', 'Profiles']];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const profilePhoto = name => window.jdExtras?.get?.('profiles', {})?.[name]?.photo;
  const pad = n => String(n).padStart(2, '0');
  const dateInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeInput = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fromInputs = (date, time = '00:00') => { const [y, m, d] = date.split('-').map(Number); const [h, min] = time.split(':').map(Number); return new Date(y, m - 1, d, h || 0, min || 0, 0, 0); };

  // ---------- toolbar ----------
  function toolbar(panel, api) {
    const bar = panel.querySelector('.calendar-toolbar');
    if (!bar) return;
    if (!bar.dataset.built) {
      bar.dataset.built = 'true';
      bar.setAttribute('data-i18n-skip', '');
      // Pill-group view switcher + profile avatars, then compact icon tools: expanding search, region
      // (a native select laid invisibly over its icon) and the round "new event" button.
      bar.innerHTML = `<div class="cal-strip"><div class="cal-views" role="group" aria-label="${esc(t('Calendar view'))}">${VIEW_LABELS.map(([id, label]) => `<button type="button" class="cal-view-btn" data-view="${id}" aria-pressed="false">${esc(t(label))}</button>`).join('')}</div>
        <div class="cal-profiles" role="group" aria-label="${esc(t('Show or hide profiles'))}"></div>
          <label class="cal-region-label cal-icon-btn" title="${esc(t('Public holidays'))}">${ICON.flag}<span class="cal-region-code" aria-hidden="true"></span><span class="sr-only">${esc(t('Public holidays'))}</span><select class="cal-region" aria-label="${esc(t('Region'))}"><option value="">${esc(t('No holidays'))}</option>${Object.entries(window.jdHolidays?.states ?? {}).map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join('')}</select></label></div>
        <div class="cal-tools">
          <div class="cal-search-wrap">${ICON.search}<input type="search" class="cal-search" placeholder="${esc(t('Search events'))}" aria-label="${esc(t('Search events'))}" autocomplete="off"></div>
          <button type="button" class="cal-new" aria-label="${esc(t('New event'))}" title="${esc(t('New event'))}">${ICON.plus}<span class="cal-new-label sr-only">${esc(t('New event'))}</span></button>
        </div><ul class="cal-search-results" role="listbox" hidden></ul>`;
      // The week module owns today/prev/next + range pills; place them right after the view pills.
      const nav = panel.querySelector('.cal-nav');
      if (nav) bar.prepend(nav);
      bar.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => api.setView(button.dataset.view)));
      bar.querySelector('.cal-new').addEventListener('click', () => openEditor({ startsAt: defaultStart(api).toISOString(), owners: [api.defaultOwner()] }));
      bar.querySelector('.cal-region').addEventListener('change', event => {
        const stateCode = event.target.value;
        guard('settings', () => window.jdExtras?.set('settings', { ...(window.jdExtras.get('settings', {}) ?? {}), stateCode }));
      });
      bar.querySelector('.cal-profiles').addEventListener('click', event => {
        const chip = event.target.closest('[data-member]');
        if (chip) api.setHidden(chip.dataset.member, !api.state.hidden.has(chip.dataset.member));
      });
      setupSearch(bar, api);
    }
    bar.querySelectorAll('[data-view]').forEach(button => { const on = button.dataset.view === api.state.view; button.setAttribute('aria-pressed', String(on)); button.classList.toggle('is-active', on); });
    const profiles = window.jdExtras?.get('profiles', {}) ?? {};
    bar.querySelector('.cal-profiles').innerHTML = api.members().map(name => {
      const shown = !api.state.hidden.has(name);
      const photo = profiles[name]?.photo;
      const mark = photo ? `<img src="${esc(photo)}" alt="">` : esc(String(name).trim().charAt(0).toUpperCase());
      return `<button type="button" class="cal-profile-chip${shown ? '' : ' is-off'}" data-member="${esc(name)}" aria-pressed="${shown}" title="${esc(name)}" style="--chip-color:${esc(api.profileColor(name))}"><span class="cal-avatar" aria-hidden="true">${mark}</span><span class="sr-only">${esc(name)}</span></button>`;
    }).join('');
    const region = bar.querySelector('.cal-region');
    region.value = window.jdExtras?.get('settings', {})?.stateCode ?? '';
    bar.querySelector('.cal-region-code').textContent = region.value;
    bar.querySelector('.cal-region-label').classList.toggle('has-region', Boolean(region.value));
  }

  function defaultStart(api) {
    const now = new Date();
    const anchor = api.state.anchor;
    const start = api.sameDay(anchor, now) || api.state.view === 'week' || api.state.view === 'month' ? now : anchor;
    const d = new Date(start); d.setMinutes(0, 0, 0); d.setHours(api.sameDay(start, now) ? now.getHours() + 1 : 9);
    return d;
  }

  // ---------- search ----------
  function setupSearch(bar, api) {
    const input = bar.querySelector('.cal-search');
    const list = bar.querySelector('.cal-search-results');
    let timer;
    const run = () => {
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) { list.hidden = true; list.innerHTML = ''; return; }
      const now = new Date();
      const from = api.addDays(api.startOfDay(now), -366), to = api.addDays(api.startOfDay(now), 731);
      const matches = api.events().filter(e => !e.private && [e.title, e.description, e.location].some(value => String(value ?? '').toLowerCase().includes(query)));
      // One hit per event: its next occurrence from now, otherwise the most recent one.
      const hits = matches.map(event => {
        const occurrences = api.expand([event], from, to).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
        return occurrences.find(o => new Date(o.startsAt) >= api.startOfDay(now)) ?? occurrences.at(-1) ?? event;
      }).sort((a, b) => Math.abs(new Date(a.startsAt) - now) - Math.abs(new Date(b.startsAt) - now)).slice(0, 12);
      list.innerHTML = hits.length ? hits.map(hit => {
        const at = new Date(hit.startsAt);
        const when = at.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) + (hit.allDay ? '' : ` · ${at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`);
        return `<li role="option"><button type="button" data-jump="${esc(hit.startsAt)}" data-provider-id="${esc(hit.providerId)}"><span class="cal-chip-dot" style="background:${esc(api.paint(hit).colors[0])}"></span><strong>${esc(hit.title)}</strong><small>${esc(when)}</small></button></li>`;
      }).join('') : `<li class="cal-search-empty">${esc(t('No matching events'))}</li>`;
      list.hidden = false;
      // The list sits outside the (scrollable) toolbar; anchor it under the search box.
      const host = list.offsetParent?.getBoundingClientRect() ?? { top: 0, left: 0, width: window.innerWidth };
      const box = input.getBoundingClientRect();
      list.style.top = `${Math.round(box.bottom - host.top + 4)}px`;
      list.style.left = `${Math.round(Math.max(0, Math.min(box.left - host.left, host.width - list.offsetWidth)))}px`;
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.value = ''; run(); } });
    list.addEventListener('click', async e => {
      const button = e.target.closest('[data-jump]');
      if (!button) return;
      list.hidden = true;
      const date = new Date(button.dataset.jump);
      await api.setView(api.state.view, date);
      const selector = `.calendar-week-panel .week-grid [data-provider-id="${CSS.escape(button.dataset.providerId)}"]`;
      const block = [...document.querySelectorAll(selector)].find(el => el.dataset.start === button.dataset.jump) ?? document.querySelector(selector);
      if (block) { block.classList.add('cal-flash'); block.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); setTimeout(() => block.classList.remove('cal-flash'), 2200); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.cal-search-wrap, .cal-search-results')) list.hidden = true; });
  }

  // ---------- month view ----------
  function month(grid, { days, events, holidays, moons, today, anchor }) {
    const api = cal();
    const DAY_MS = 86400000;
    const heads = days.slice(0, 7).map(d => `<div class="cal-month-head">${esc(d.toLocaleDateString(undefined, { weekday: 'short' }).replace(/\.$/, ''))}</div>`).join('');
    const cells = days.map(d => {
      const dayStart = api.startOfDay(d).getTime();
      const dayEvents = events.filter(e => { const s = new Date(e.startsAt).getTime(); return s < dayStart + DAY_MS && api.eventEndTime(e) > dayStart; })
        .sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || new Date(a.startsAt) - new Date(b.startsAt));
      const items = [
        ...(holidays.get(api.dayKey(d)) ?? []).map(name => `<span class="cal-month-chip cal-holiday" title="${esc(name)}">★ ${esc(name)}</span>`),
        ...dayEvents.map(e => {
          const look = api.paint(e);
          const start = new Date(e.startsAt);
          const time = !e.allDay && start.getTime() >= dayStart ? `<time>${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time> ` : '';
          return `<button type="button" class="cal-month-chip${look.cls}${e.allDay ? ' is-allday' : ''}${api.isPast(e) ? ' is-past' : ''}" data-provider-id="${esc(e.providerId)}" data-start="${esc(e.startsAt)}" data-end="${esc(e.endsAt ?? '')}" style="${look.style}">${time}${e.eventType === 'birthday' ? '🎂 ' : ''}${esc(e.private ? t('Busy') : e.title)}</button>`;
        })
      ];
      const moon = moons.filter(m => api.sameDay(m.at, d)).map(m => { const l = window.jdMoonLabel(m); return `<span class="cal-month-moon" title="${esc(`${l.name} · ${l.time}`)}">${l.icon}</span>`; }).join('');
      const classes = ['cal-month-cell', d.getMonth() !== anchor.getMonth() ? 'is-outside' : '', api.sameDay(d, today) ? 'is-today' : '', (d.getDay() + 6) % 7 > 4 ? 'is-weekend' : ''].filter(Boolean).join(' ');
      return `<div class="${classes}" data-date="${api.dayKey(d)}"><div class="cal-month-top"><button type="button" class="cal-month-day" data-goto="${api.dayKey(d)}" aria-label="${esc(d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}">${d.getDate()}</button>${moon}</div><div class="cal-month-items">${items.join('')}</div><button type="button" class="cal-month-more" data-goto="${api.dayKey(d)}" hidden></button></div>`;
    }).join('');
    grid.innerHTML = `<div class="cal-month" data-i18n-skip>${heads}${cells}</div>`;
    fitMonth(grid);
    grid.querySelectorAll('[data-goto]').forEach(button => button.addEventListener('click', () => { const [y, m, dd] = button.dataset.goto.split('-').map(Number); api.setView('day', new Date(y, m - 1, dd)); }));
  }

  // Show as many chips as fit in each cell; the rest collapse into "+n more" (opens the day view).
  function fitMonth(grid) {
    grid.querySelectorAll('.cal-month-cell').forEach(cell => {
      const box = cell.querySelector('.cal-month-items');
      const more = cell.querySelector('.cal-month-more');
      const chips = [...box.children];
      chips.forEach(chip => { chip.hidden = false; });
      more.hidden = true;
      if (box.scrollHeight <= box.clientHeight + 1) return;
      more.hidden = false;
      more.textContent = '+0';
      const limit = box.clientHeight;
      let hidden = 0;
      for (let i = chips.length - 1; i >= 0 && box.scrollHeight > limit + 1; i--) { chips[i].hidden = true; hidden++; }
      if (hidden === chips.length && chips.length) { chips[0].hidden = false; hidden--; }
      more.textContent = `+${hidden}`;
      more.setAttribute('aria-label', `+${hidden} ${t('more')}`);
    });
  }

  // ---------- event editor ----------
  let dialog;
  const REMINDERS = [['', 'No reminder'], ['0', 'At start time'], ['5', '5 minutes before'], ['15', '15 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']];
  const REPEATS = [['', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly'], ['custom', 'Custom weekdays']];

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'cal-editor-dialog';
    dialog.setAttribute('data-i18n-skip', '');
    document.body.append(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    return dialog;
  }

  async function openEditor(event = {}) {
    return guard('events', () => showEditor(event));
  }

  async function showEditor(event) {
    const api = cal();
    const household = await fetch('/api/household/demo').then(r => r.json()).catch(() => null);
    const members = household?.members?.length ? household.members : api?.members() ?? [];
    const editing = Boolean(event.providerId);
    const start = event.startsAt ? new Date(event.startsAt) : (api ? defaultStart(api) : new Date());
    const endTime = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + (event.allDay ? 86400000 : 3600000));
    // All-day events store an exclusive end (next midnight); the form shows the last day.
    const end = event.allDay ? new Date(Math.max(start.getTime(), endTime.getTime() - 1)) : endTime;
    const owners = (event.owners?.length ? event.owners : [event.owner ?? members[0] ?? 'Shared']).filter(Boolean);
    const repeat = event.recurrence === 'weekly' && event.recurrenceDays?.length ? 'custom' : (event.recurrence ?? '');
    const days = new Set(event.recurrenceDays ?? []);
    const memberChoices = [...new Set([...members, ...owners.filter(name => name !== 'Shared')])];
    const box = ensureDialog();
    box.innerHTML = `<form class="cal-editor" method="dialog" novalidate>
      <button type="button" class="close" data-editor-close aria-label="Close">×</button>
      <h2 class="cal-editor-title">${esc(t(editing ? 'Edit event' : 'New event'))}</h2>
      <label class="jd-field">${esc(t('Title'))}<input name="title" required maxlength="120" value="${esc(event.title ?? '')}"></label>
      <label class="jd-switch cal-allday"><span>${esc(t('All day'))}</span><input type="checkbox" name="allDay" role="switch" ${event.allDay ? 'checked' : ''}></label>
      <div class="cal-editor-row"><label class="jd-field">${esc(t('Starts'))}<input type="date" name="startDate" required value="${dateInput(start)}"></label><label class="jd-field cal-time">&nbsp;<input type="time" name="startTime" value="${timeInput(start)}" aria-label="${esc(t('Starts'))}"></label></div>
      <div class="cal-editor-row"><label class="jd-field">${esc(t('Ends'))}<input type="date" name="endDate" required value="${dateInput(end)}"></label><label class="jd-field cal-time">&nbsp;<input type="time" name="endTime" value="${timeInput(end)}" aria-label="${esc(t('Ends'))}"></label></div>
      <label class="jd-field">${esc(t('Repeat'))}<select name="repeat">${REPEATS.map(([value, label]) => `<option value="${value}"${value === repeat ? ' selected' : ''}>${esc(t(label))}</option>`).join('')}</select></label>
      <fieldset class="cal-weekdays"${repeat === 'custom' ? '' : ' hidden'}><legend class="sr-only">${esc(t('Custom weekdays'))}</legend>${WEEKDAYS.map(day => `<label class="cal-weekday"><input type="checkbox" name="days" value="${day}"${days.has(day) ? ' checked' : ''}><span>${esc(t(day))}</span></label>`).join('')}<button type="button" class="cal-workdays" data-workdays>${esc(t('Mon–Fri'))}</button></fieldset>
      <label class="jd-field">${esc(t('Reminder'))}<select name="reminder">${REMINDERS.map(([value, label]) => `<option value="${value}"${String(event.reminderMinutes ?? '') === value ? ' selected' : ''}>${esc(t(label))}</option>`).join('')}</select></label>
      <fieldset class="cal-owner-pick"><legend>${esc(t('Profiles'))}</legend>${memberChoices.map(name => `<label class="cal-owner" style="--chip-color:${esc(api ? api.profileColor(name) : '#3a74e0')}"><input type="checkbox" name="owners" value="${esc(name)}"${owners.includes(name) ? ' checked' : ''}><span class="cal-avatar" aria-hidden="true">${profilePhoto(name) ? `<img src="${esc(profilePhoto(name))}" alt="">` : esc(String(name).trim().charAt(0).toUpperCase())}</span><span class="cal-owner-name">${esc(name)}</span></label>`).join('') || `<span class="muted">${esc(t('Shared'))}</span>`}</fieldset>
      <label class="jd-field">${esc(t('Location'))}<input name="location" maxlength="200" value="${esc(event.location ?? '')}"></label>
      <label class="jd-field">${esc(t('Description'))}<textarea name="description" rows="3" maxlength="2000">${esc(event.description ?? '')}</textarea></label>
      <p class="cal-editor-error" role="alert" hidden></p>
      <div class="inline-actions">${editing ? `<button type="button" class="jd-btn danger" data-editor-delete>${esc(t('Delete event'))}</button>` : ''}<button type="button" class="jd-btn cal-btn-soft" data-editor-close>${esc(t('Cancel'))}</button><button type="submit" class="jd-btn primary">${esc(t('Save'))}</button></div>
    </form>`;
    const form = box.querySelector('form');
    const syncAllDay = () => form.querySelectorAll('.cal-time').forEach(el => { el.hidden = form.elements.allDay.checked; });
    syncAllDay();
    form.elements.allDay.addEventListener('change', syncAllDay);
    form.elements.repeat.addEventListener('change', () => { form.querySelector('.cal-weekdays').hidden = form.elements.repeat.value !== 'custom'; });
    form.querySelector('[data-workdays]').addEventListener('click', () => form.querySelectorAll('[name="days"]').forEach(input => { input.checked = WEEKDAYS.indexOf(input.value) < 5; }));
    form.elements.startDate.addEventListener('change', () => { if (form.elements.endDate.value < form.elements.startDate.value) form.elements.endDate.value = form.elements.startDate.value; });
    box.querySelectorAll('[data-editor-close]').forEach(button => button.addEventListener('click', () => box.close()));
    box.querySelector('[data-editor-delete]')?.addEventListener('click', async () => {
      if (!window.confirm(t('Delete this event?'))) return;
      const response = await fetch(`/api/calendar/events/${encodeURIComponent(event.providerId)}`, { method: 'DELETE' });
      if (response.ok) { live('Calendar event deleted'); box.close(); window.jdRefreshCalendarWeek?.(); }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const error = form.querySelector('.cal-editor-error');
      const fail = message => { error.textContent = message; error.hidden = false; };
      const title = form.elements.title.value.trim();
      if (!title) { form.elements.title.focus(); return fail(t('Title')); }
      const allDay = form.elements.allDay.checked;
      let startsAt = fromInputs(form.elements.startDate.value, allDay ? '00:00' : form.elements.startTime.value || '00:00');
      let endsAt = allDay ? fromInputs(form.elements.endDate.value || form.elements.startDate.value) : fromInputs(form.elements.endDate.value || form.elements.startDate.value, form.elements.endTime.value || '00:00');
      if (allDay) { endsAt.setDate(endsAt.getDate() + 1); if (endsAt <= startsAt) { endsAt = new Date(startsAt); endsAt.setDate(endsAt.getDate() + 1); } }
      else if (endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + 3600000);
      const repeatValue = form.elements.repeat.value;
      const recurrenceDays = repeatValue === 'custom' ? [...form.querySelectorAll('[name="days"]:checked')].map(input => input.value) : [];
      if (repeatValue === 'custom' && !recurrenceDays.length) return fail(t('Pick at least one weekday'));
      const chosen = [...form.querySelectorAll('[name="owners"]:checked')].map(input => input.value);
      const ownerList = chosen.length ? chosen : ['Shared'];
      const reminderMinutes = form.elements.reminder.value === '' ? null : Number(form.elements.reminder.value);
      const body = {
        title, description: form.elements.description.value, location: form.elements.location.value, allDay,
        startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), owners: ownerList, owner: ownerList[0],
        recurrence: repeatValue === 'custom' ? 'weekly' : (repeatValue || null), recurrenceDays, reminderMinutes
      };
      const response = await fetch(editing ? `/api/calendar/events/${encodeURIComponent(event.providerId)}` : '/api/calendar/events', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
      if (!response?.ok) return fail(t('Calendar event could not be saved'));
      const saved = await response.json();
      await syncReminder(saved, reminderMinutes, editing && event.reminderMinutes != null);
      live(t(editing ? 'Calendar event updated' : 'Calendar event added'));
      box.close();
      window.jdRefreshCalendarWeek?.();
    });
    box.showModal();
    form.elements.title.focus();
  }

  // Reminder for the next occurrence (POST /api/reminders, kind 'event'); "none" dismisses an earlier one.
  async function syncReminder(event, minutes, hadReminder) {
    const id = `event-${event.providerId}`;
    if (minutes == null) { if (hadReminder) await fetch(`/api/reminders/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }).catch(() => null); return; }
    const api = cal();
    const now = new Date();
    const upcoming = api ? api.expand([event], now, api.addDays(now, 400)).map(o => new Date(o.startsAt)).filter(d => d.getTime() - minutes * 60000 >= now.getTime() - 60000).sort((a, b) => a - b)[0] : null;
    const start = upcoming ?? new Date(event.startsAt);
    const dueAt = new Date(start.getTime() - minutes * 60000).toISOString();
    await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, kind: 'event', dueAt, offsetMinutes: minutes, member: event.owner ?? 'household', title: event.title }) }).catch(() => null);
  }

  window.jdOpenEventEditor = openEditor;
  window.jdCalendarViews = { toolbar, month, openEditor };
  window.jdRefreshCalendarWeek?.();
})();
