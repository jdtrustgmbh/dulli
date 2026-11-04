(() => {
  const fallbackMembers = ['Jordan', 'Alex'];
  let membersPromise;
  let tasksPromise;
  const members = () => membersPromise ??= fetch('/api/household/demo').then(response => response.ok ? response.json() : null).then(household => [...new Set([...(household?.members ?? fallbackMembers), 'Shared', 'Unassigned'])]).catch(() => [...fallbackMembers, 'Shared', 'Unassigned']);
  const taskByTitle = async title => (await (tasksPromise ??= fetch('/api/tasks').then(response => response.json()))).find(task => task.title === title);
  const enhanceRow = async row => {
    if (row.querySelector('.owner-select') || row.dataset.ownerLoading === 'true') return;
    row.dataset.ownerLoading = 'true';
    const title = row.querySelector('span')?.textContent?.trim();
    if (!title) return;
    const task = await taskByTitle(title).catch(() => null);
    const select = document.createElement('select');
    select.className = 'owner-select';
    select.dataset.i18nSkip = '';
    select.setAttribute('aria-label', `${window.jdT ? window.jdT('Task owner for') : 'Task owner for'} ${title}`);
    for (const name of await members()) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
    if (task?.owner) select.value = task.owner;
    select.addEventListener('change', async () => {
      const live = document.querySelector('#live-region');
      try {
        const current = await taskByTitle(title); if (!current) throw new Error('task missing');
        const response = await fetch(`/api/tasks/${current.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, owner: select.value }) });
        if (!response.ok) throw new Error('handoff failed');
        const meta = row.querySelector('small'); if (meta) meta.textContent = `${select.value} · shared`;
        if (live) live.textContent = `Task handed to ${select.value}`;
      } catch { if (live) live.textContent = `Task handed to ${select.value} locally; sync pending`; }
    });
    row.append(select);
    delete row.dataset.ownerLoading;
  };
  const enhance = () => [...document.querySelectorAll('#task-list li, .module-view:not([hidden]) .module-data li:not(.lp-item)')].filter(row => !row.hidden).slice(0, 20).forEach(row => { enhanceRow(row); });
  window.__jdRegisterEnhancer(enhance);
})();
