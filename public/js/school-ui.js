(() => {
  const live = document.querySelector('#live-region');
  const esc = value => String(value ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  let panel; let editingId = null;
  async function render() {
    const entries = await (await fetch('/api/school')).json();
    panel.querySelector('.school-grid').innerHTML = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => `<div class="school-day"><strong class="jd-day-head">${day}</strong>${entries.filter(item => item.weekday === day).map(item => `<article style="--c:${window.jdMemberColor ? window.jdMemberColor(item.child) : 'var(--teal)'};border-left-color:var(--c)"><b data-i18n-skip>${esc(item.title)}</b><small>${esc(item.startsAt)}${item.room ? ` · ${esc(item.room)}` : ''}</small><small class="school-child" data-i18n-skip>${esc(item.child)}</small><span class="jd-lesson-badge" aria-hidden="true" data-i18n-skip>${esc(String(item.child ?? '').trim().charAt(0).toUpperCase())}</span><span class="inline-actions"><button type="button" class="module-action" data-school-edit="${esc(item.id)}">Edit</button><button type="button" class="module-action" data-school-delete="${esc(item.id)}">Delete</button></span></article>`).join('') || '<span class="muted">No lessons</span>'}</div>`).join('');
    panel.querySelectorAll('[data-school-edit]').forEach(button => button.addEventListener('click', () => {
      const entry = entries.find(item => item.id === button.dataset.schoolEdit);
      if (!entry) return;
      editingId = entry.id;
      const form = panel.querySelector('.school-form');
      form.querySelector('[name="child"]').value = entry.child;
      form.querySelector('[name="weekday"]').value = entry.weekday;
      form.querySelector('[name="title"]').value = entry.title;
      form.querySelector('[name="startsAt"]').value = entry.startsAt;
      form.querySelector('[name="room"]').value = entry.room ?? '';
      form.querySelector('button[type="submit"]').textContent = 'Update lesson';
      form.scrollIntoView({ block: 'nearest' });
    }));
    panel.querySelectorAll('[data-school-delete]').forEach(button => button.addEventListener('click', async () => {
      if (!window.confirm(window.jdT ? window.jdT('Delete this lesson?') : 'Delete this lesson?')) return;
      const response = await fetch(`/api/school/${button.dataset.schoolDelete}`, { method: 'DELETE' });
      if (!response.ok) { live.textContent = 'Lesson could not be deleted'; return; }
      live.textContent = 'Lesson deleted';
      render();
    }));
  }
  window.jdOpenSchool = async () => {
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'card school-panel';
      panel.innerHTML = `<div class="card-heading"><div><p class="eyebrow">SCHOOL & TIMETABLE</p><h2>Weekly timetable</h2></div><span class="muted">Mon–Fri</span></div><form class="school-form"><label>Child<select name="child"></select></label><label>Weekday<select name="weekday"><option value="Monday">Monday</option><option value="Tuesday">Tuesday</option><option value="Wednesday">Wednesday</option><option value="Thursday">Thursday</option><option value="Friday">Friday</option></select></label><label>Subject<input name="title" required maxlength="80" placeholder="Maths"></label><label>Time<input name="startsAt" type="time" value="08:00" required></label><label>Room / teacher<input name="room" maxlength="80" placeholder="Optional"></label><button class="primary-button" type="submit">Add lesson</button></form><div class="school-grid" aria-live="polite"></div>`;
      document.querySelector('.shell').append(panel);
      const childSelect = panel.querySelector('[name="child"]');
      fetch('/api/household/demo').then(response => response.json()).then(household => { const roles = household?.memberRoles ?? {}; const children = household?.members?.filter(name => roles[name] === 'child') ?? []; childSelect.innerHTML = children.length ? children.map(name => `<option>${name}</option>`).join('') : '<option>Household</option>'; }).catch(() => { childSelect.innerHTML = '<option>Household</option>'; });
      panel.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const value = Object.fromEntries(new FormData(form));
        const target = editingId ? `/api/school/${editingId}` : '/api/school';
        const response = await fetch(target, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...value, recurring: true }) });
        if (!response.ok) { live.textContent = editingId ? 'Lesson could not be updated' : 'Lesson could not be saved'; return; }
        live.textContent = editingId ? 'Lesson updated' : 'Lesson added to timetable';
        // Only the fields the user is done with get cleared; child and weekday are kept, since
        // adding several lessons for the same child/day in a row is the common flow and losing
        // that selection on every submit meant an extra pick each time.
        const keptChild = form.querySelector('[name="child"]').value;
        const keptWeekday = form.querySelector('[name="weekday"]').value;
        form.reset();
        form.querySelector('[name="child"]').value = keptChild;
        form.querySelector('[name="weekday"]').value = keptWeekday;
        editingId = null;
        form.querySelector('button[type="submit"]').textContent = 'Add lesson';
        render();
      });
    }
    panel.hidden = false;
    await render();
  };
})();
