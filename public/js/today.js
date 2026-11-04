(() => {
  let horizon = 'today';
  const render = async () => {
    const timeline = document.querySelector('.timeline');
    if (!timeline) return;
    const focusCard = timeline.closest('.focus-card');
    let controls = focusCard?.querySelector('.today-horizon');
    if (!controls) {
      controls = document.createElement('div'); controls.className = 'today-horizon'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Time horizon');
      [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next 7 days']].forEach(([value, label]) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'horizon-button'; button.textContent = label; button.setAttribute('aria-pressed', value === horizon ? 'true' : 'false'); button.addEventListener('click', () => { horizon = value; controls.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', item.textContent === label ? 'true' : 'false')); render(); }); controls.append(button); });
      focusCard?.querySelector('.card-heading')?.after(controls);
    }
    try {
      const response = await fetch('/api/calendar/events');
      if (!response.ok) throw new Error('calendar unavailable');
      const events = await response.json();
      if (!Array.isArray(events)) return;
      const now = Date.now();
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); if (horizon === 'tomorrow') { start.setDate(start.getDate() + 1); end.setDate(end.getDate() + 2); } else if (horizon === 'week') end.setDate(end.getDate() + 7); else end.setDate(end.getDate() + 1);
      const scoped = events.filter(event => { const time = new Date(event.startsAt).getTime(); return Number.isFinite(time) && time >= start.getTime() && time < end.getTime(); });
      const upcoming = events.filter(event => { const time = new Date(event.startsAt).getTime(); if (!Number.isFinite(time) || time < start.getTime() || time >= end.getTime()) return false; if (event.allDay) return true; return time >= now; });
      const visibleEvents = (horizon === 'today' ? upcoming : scoped).slice().sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 5);
      if (!visibleEvents.length) { timeline.innerHTML = '<p class="muted today-empty">Nothing scheduled for this horizon.</p>'; return; }
      const fragment = document.createDocumentFragment();
      let lastDayKey = null;
      visibleEvents.forEach((event, index) => {
        if (horizon === 'week') {
          const eventDate = new Date(event.startsAt);
          const dayKey = eventDate.toDateString();
          if (dayKey !== lastDayKey) {
            lastDayKey = dayKey;
            const separator = document.createElement('p');
            separator.className = 'timeline-day-separator';
            separator.textContent = eventDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
            fragment.append(separator);
          }
        }
        const row = document.createElement('div');
        row.className = 'timeline-item';
        const time = document.createElement('time');
        time.textContent = event.allDay ? (event.eventType === 'birthday' ? '🎂' : 'All day') : new Date(event.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dot = document.createElement('div');
        dot.className = 'dot';
        const ownerColor = window.jdMemberColor ? window.jdMemberColor(event.owner) : ['#00A6A9', '#FE4758', '#FFBC00'][index % 3];
        dot.style.background = event.eventType === 'birthday' ? '#FE4758' : ownerColor;
        dot.style.boxShadow = `0 0 0 5px ${event.eventType === 'birthday' ? '#FE4758' : ownerColor}22`;
        const content = document.createElement('div');
        const title = document.createElement('strong');
        title.dataset.i18nSkip = ''; title.textContent = event.title;
        const meta = document.createElement('p');
        const tr = text => window.jdT?.(text) ?? text; const repeat = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[event.recurrence];
        meta.dataset.i18nSkip = ''; meta.textContent = `${(event.owner ?? 'Shared') === 'Shared' ? tr('Shared') : event.owner}${repeat ? ` · ${tr(repeat)}` : (event.recurrence ? ` · ${tr('Repeating')}` : '')}`;
        content.append(title, meta);
        row.append(time, dot, content);
        fragment.append(row);
      });
      timeline.replaceChildren(fragment);
    } catch {
      // Static Today fallback remains usable when the calendar is unavailable.
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();
  // The page often stays open for days (home-screen app, wall display): refresh when it becomes visible again, when the
  // Today tab is opened, when the calendar day rolls over, and every few minutes so past events drop out.
  let renderedDay = new Date().toDateString();
  const refresh = () => { renderedDay = new Date().toDateString(); render(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('hashchange', () => { if (location.hash === '#today' || !location.hash) refresh(); });
  document.addEventListener('click', event => { if (event.target.closest('.brand, .clock-title, .tabs a[href="#today"]')) setTimeout(refresh, 60); }, true);
  setInterval(() => { if (document.visibilityState === 'visible' && (new Date().toDateString() !== renderedDay || Date.now() % 300000 < 30000)) refresh(); }, 30000);
  window.jdRenderToday = refresh;
})();
