(() => {
  const today = document.querySelector('.today-grid');
  const dialog = document.querySelector('#capture-dialog');
  const input = document.querySelector('#capture-input');
  const esc = value => String(value ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  if (!today) return;
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const key = link.getAttribute('href').slice(1);
    if (!['today', 'calendar', 'tasks', 'lists', 'school', 'more'].includes(key)) return;
    const module = document.querySelector('.module-view');
    const more = document.querySelector('.tool-grid')?.closest('.card');
    const greetingBlock = document.querySelector('.greeting-block');
    event.preventDefault(); event.stopImmediatePropagation(); today.hidden = key !== 'today'; if (greetingBlock) greetingBlock.hidden = key !== 'today'; if (module) module.hidden = !['tasks', 'lists'].includes(key); if (more) more.hidden = key !== 'more'; document.querySelectorAll('.school-panel, .calendar-week-panel, .rewards-panel, .meals-panel, .photos-panel, .members-panel, .routines-panel').forEach(panel => { panel.hidden = true; }); document.querySelector('.shell')?.classList.toggle('shell-wide', key === 'calendar'); document.querySelectorAll('.tabs a').forEach(item => item.classList.toggle('active', item.getAttribute('href') === `#${key}`)); history.replaceState(null, '', `#${key}`);
    if (key === 'calendar') { window.jdOpenCalendarWeek?.(); return; }
    if (key === 'school') { window.jdOpenSchool?.(); return; }
    if (key === 'tasks') window.jdOpenRoutines?.();
    if (!module || !['tasks', 'lists'].includes(key)) return;
    if (key === 'lists' && window.jdListsPlus) { module.dataset.module = 'lists'; window.jdListsPlus.render(module); return; }
    const copy = { tasks: ['Tasks & routines', 'Open work, ownership and handoff stay visible.'], lists: ['Lists & shopping', 'Shared lists remain quick to check and update.'] }[key];
    module.dataset.module = key;
    module.innerHTML = `<p class="eyebrow">${key.charAt(0).toUpperCase()}${key.slice(1)}</p><h2>${copy[0]}</h2><p class="muted">${copy[1]}</p><div class="module-data">Loading shared data…</div><button class="primary-button" data-open-capture>＋ Add with Quick capture</button>`;
    module.querySelector('[data-open-capture]')?.addEventListener('click', () => { dialog?.showModal(); input?.focus(); });
    const endpoint = { tasks: '/api/tasks', lists: '/api/lists/items' }[key];
    fetch(endpoint).then(response => response.json()).then(items => {
      const data = module.querySelector('.module-data');
      if (!Array.isArray(items) || !items.length) { data.textContent = 'No shared items yet.'; return; }
      data.innerHTML = `<ul class="check-list">${items.map(item => { const title = esc(item.title ?? 'Untitled'); const meta = esc(`${item.owner ?? (item.completed ? 'done' : 'open')}${key === 'tasks' && item.recurrence ? ` · ${item.recurrence}` : ''}`); return `<li${item.completed ? ' class="completed"' : ''}><span data-i18n-skip>${title}</span><small data-i18n-skip>${meta}</small></li>`; }).join('')}</ul>`;
    }).catch(() => { module.querySelector('.module-data').textContent = 'Shared data unavailable; Today remains available.'; });
  }, true);
})();
(() => { const key = location.hash.slice(1); if (!['today', 'calendar', 'tasks', 'lists', 'school', 'more'].includes(key) || key === 'today') return; const link = document.querySelector(`.tabs a[href="#${key}"]`); if (link) setTimeout(() => link.click(), 0); })();
