(() => {
  const live = () => document.querySelector('#live-region');
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayLabel = day => ({ Mon: 'Mo', Tue: 'Tu', Wed: 'We', Thu: 'Th', Fri: 'Fr', Sat: 'Sa', Sun: 'Su' }[day] ?? day);

  const recurrenceSummary = task => {
    if (!task.recurrence) return '';
    if (task.recurrence === 'daily') return 'Daily';
    if (task.recurrenceDays?.length) return task.recurrenceDays.map(dayLabel).join(', ');
    return 'Weekly';
  };

  async function members() {
    try { const household = await (await fetch('/api/household/demo')).json(); return household?.members?.length ? household.members : ['Unassigned']; } catch { return ['Unassigned']; }
  }

  function formHtml(task) {
    const freq = task?.recurrence === 'daily' ? 'daily' : task?.recurrenceDays?.length ? 'weekly' : task?.recurrence === 'weekly' ? 'weekly' : 'none';
    return `<form class="routine-form">
      <label>Title<input name="title" maxlength="100" required value="${esc(task?.title ?? '')}"></label>
      <label>Owner<select name="owner"></select></label>
      <fieldset class="routine-frequency">
        <legend>Repeat</legend>
        <label><input type="radio" name="frequency" value="none" ${freq === 'none' ? 'checked' : ''}> Once</label>
        <label><input type="radio" name="frequency" value="daily" ${freq === 'daily' ? 'checked' : ''}> Daily</label>
        <label><input type="radio" name="frequency" value="weekly" ${freq === 'weekly' ? 'checked' : ''}> Specific days</label>
      </fieldset>
      <div class="routine-days"${freq === 'weekly' ? '' : ' hidden'}>${DAYS.map(day => `<label><input type="checkbox" name="days" value="${day}" ${task?.recurrenceDays?.includes(day) ? 'checked' : ''}>${dayLabel(day)}</label>`).join('')}</div>
      <div class="inline-actions"><button type="submit" class="primary-button">Save</button>${task ? '<button type="button" class="outline-button" data-routine-cancel>Cancel</button>' : ''}</div>
    </form>`;
  }

  async function wireForm(host, task, onDone) {
    const select = host.querySelector('[name="owner"]');
    const names = await members();
    select.innerHTML = names.map(name => `<option ${task?.owner === name ? 'selected' : ''}>${esc(name)}</option>`).join('') + `<option value="Unassigned" ${task?.owner === 'Unassigned' ? 'selected' : ''}>Unassigned</option>`;
    host.querySelectorAll('[name="frequency"]').forEach(radio => radio.addEventListener('change', () => {
      host.querySelector('.routine-days').hidden = radio.value !== 'weekly' || !radio.checked;
    }));
    host.querySelector('[data-routine-cancel]')?.addEventListener('click', () => onDone());
    host.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = form.querySelector('[name="title"]').value.trim();
      if (!title) return;
      const owner = form.querySelector('[name="owner"]').value;
      const frequency = form.querySelector('[name="frequency"]:checked')?.value ?? 'none';
      const recurrence = frequency === 'none' ? null : frequency;
      const recurrenceDays = frequency === 'weekly' ? [...form.querySelectorAll('[name="days"]:checked')].map(box => box.value) : [];
      const body = JSON.stringify({ title, owner, recurrence, recurrenceDays });
      try {
        const response = task
          ? await fetch(`/api/tasks/${task.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
          : await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (!response.ok) throw new Error('save failed');
        if (live()) live().textContent = task ? 'Routine updated' : 'Routine added';
        window.loadSharedData?.();
        onDone();
      } catch { if (live()) live().textContent = 'Routine could not be saved; retry when connected'; }
    });
  }

  async function renderRoutines(panel) {
    const tasks = await (await fetch('/api/tasks')).json();
    const routines = tasks.filter(task => task.recurrence);
    panel.querySelector('.routine-list').innerHTML = routines.map(task => `<li data-task-id="${task.id}"><span data-i18n-skip>${esc(task.title)}</span><small data-i18n-skip>${esc(task.owner)} · ${esc(recurrenceSummary(task))}</small><span class="inline-actions"><button type="button" class="module-action" data-routine-edit="${task.id}">Edit</button><button type="button" class="module-action" data-routine-delete="${task.id}">Delete</button></span></li>`).join('') || '<li class="empty-state">No routines yet</li>';
    panel.querySelectorAll('[data-routine-edit]').forEach(button => button.addEventListener('click', async () => {
      const task = routines.find(item => item.id === button.dataset.routineEdit);
      const editHost = panel.querySelector('.routine-edit-slot');
      panel.querySelector('.routine-list').hidden = true;
      editHost.innerHTML = formHtml(task);
      await wireForm(editHost, task, () => { editHost.innerHTML = ''; panel.querySelector('.routine-list').hidden = false; renderRoutines(panel); });
    }));
    panel.querySelectorAll('[data-routine-delete]').forEach(button => button.addEventListener('click', async () => {
      if (!window.confirm(window.jdT ? window.jdT('Delete this routine?') : 'Delete this routine?')) return;
      const response = await fetch(`/api/tasks/${button.dataset.routineDelete}`, { method: 'DELETE' });
      if (response.ok) { if (live()) live().textContent = 'Routine deleted'; window.loadSharedData?.(); renderRoutines(panel); }
    }));
  }

  window.jdOpenRoutines = async () => {
    // The Tasks board (public/features/tasks-plus.js) supersedes this panel: per-profile tasks incl. recurring ones, edit and delete.
    if (window.jdOpenTasksBoard) return window.jdOpenTasksBoard();
    let panel = document.querySelector('.routines-panel');
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'card routines-panel';
      panel.innerHTML = `<div class="card-heading"><div><p class="eyebrow">ROUTINES</p><h2>Recurring responsibilities</h2></div></div><ul class="routine-list member-list"></ul><div class="routine-edit-slot"></div><div class="routine-add-slot"></div>`;
      document.querySelector('.shell').append(panel);
      const addSlot = panel.querySelector('.routine-add-slot');
      const addButton = document.createElement('button'); addButton.type = 'button'; addButton.className = 'outline-button'; addButton.textContent = '＋ Add routine';
      addButton.addEventListener('click', async () => {
        panel.querySelector('.routine-list').hidden = true;
        addSlot.innerHTML = formHtml(null);
        await wireForm(addSlot, null, () => { addSlot.innerHTML = ''; addSlot.append(addButton); panel.querySelector('.routine-list').hidden = false; renderRoutines(panel); });
      });
      addSlot.append(addButton);
    }
    panel.hidden = false;
    await renderRoutines(panel);
  };
})();
