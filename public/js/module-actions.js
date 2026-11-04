(() => {
  const enhance = () => {
    document.querySelectorAll('.module-data li').forEach(row => {
      if (row.dataset.actionReady) return;
      const module = row.closest('.module-view')?.dataset.module;
      if (!['tasks', 'lists'].includes(module)) return;
      const title = row.querySelector('span')?.textContent?.trim();
      if (!title) return;
      const action = document.createElement('button');
      action.className = 'module-action';
      action.type = 'button';
      action.textContent = module === 'tasks' ? 'Complete' : 'Check';
      action.setAttribute('aria-label', `${action.textContent} ${title}`);
      action.addEventListener('click', async () => {
        const live = document.querySelector('#live-region');
        try {
          const items = await (await fetch(module === 'tasks' ? '/api/tasks' : '/api/lists/items')).json();
          const item = items.find(value => value.title === title);
          if (!item) throw new Error('item missing');
          const completed = action.dataset.completed === 'true';
          const path = module === 'tasks' ? `/api/tasks/${item.id}/${completed ? 'undo' : 'complete'}` : `/api/lists/items/${item.id}/${completed ? 'reopen' : 'check'}`;
          const response = await fetch(path, { method: 'POST' });
          if (!response.ok) throw new Error('action failed');
          action.dataset.completed = completed ? 'false' : 'true';
          action.textContent = module === 'tasks' ? (completed ? 'Complete' : 'Undo') : (completed ? 'Check' : 'Undo');
          action.setAttribute('aria-label', `${action.textContent} ${title}`);
          window.jdRetranslateAttr?.(action, 'aria-label');
          row.classList.toggle('completed', !completed);
          window.loadSharedData?.();
          if (live) live.textContent = completed ? (module === 'tasks' ? 'Task reopened' : 'List item reopened') : (module === 'tasks' ? 'Task completed' : 'List item checked');
        } catch {
          if (live) live.textContent = `${module === 'tasks' ? 'Task' : 'List item'} action unavailable; Today remains available`;
        }
      });
      row.append(action);
      if (module === 'tasks') {
        const controls = document.createElement('span'); controls.className = 'inline-actions';
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'module-action'; edit.textContent = 'Edit'; edit.setAttribute('aria-label', `Edit ${title}`); edit.addEventListener('click', async () => { const next = window.prompt(window.jdT('Task title'), title)?.trim(); if (!next || next === title) return; const live = document.querySelector('#live-region'); try { const items = await (await fetch('/api/tasks')).json(); const item = items.find(value => value.title === title); const response = await fetch(`/api/tasks/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: next }) }); if (!response.ok) throw new Error(); row.querySelector('span').textContent = next; window.loadSharedData?.(); if (live) live.textContent = 'Task updated'; } catch { if (live) live.textContent = 'Task update unavailable; retry when connected'; } });
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'module-action'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete ${title}`); remove.addEventListener('click', async () => { if (!window.confirm(`${window.jdT('Delete')} ${title}?`)) return; const live = document.querySelector('#live-region'); try { const items = await (await fetch('/api/tasks')).json(); const item = items.find(value => value.title === title); const response = await fetch(`/api/tasks/${item.id}`, { method: 'DELETE' }); if (!response.ok) throw new Error(); row.remove(); window.loadSharedData?.(); if (live) live.textContent = 'Task deleted'; } catch { if (live) live.textContent = 'Task deletion unavailable; retry when connected'; } }); controls.append(edit, remove); row.append(controls);
      }
      if (module === 'lists') {
        const move = document.createElement('span'); move.className = 'inline-actions';
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'module-action'; edit.textContent = 'Edit'; edit.setAttribute('aria-label', `Edit ${title}`); edit.addEventListener('click', async () => { const next = window.prompt(window.jdT('List item'), title)?.trim(); if (!next || next === title) return; const live = document.querySelector('#live-region'); try { const items = await (await fetch('/api/lists/items')).json(); const item = items.find(value => value.title === title); const response = await fetch(`/api/lists/items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: next }) }); if (!response.ok) throw new Error(); row.querySelector('span').textContent = next; window.loadSharedData?.(); if (live) live.textContent = 'List item updated'; } catch { if (live) live.textContent = 'List item update unavailable; retry when connected'; } });
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'module-action'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete ${title}`); remove.addEventListener('click', async () => { if (!window.confirm(`${window.jdT('Delete')} ${title}?`)) return; const live = document.querySelector('#live-region'); try { const items = await (await fetch('/api/lists/items')).json(); const item = items.find(value => value.title === title); const response = await fetch(`/api/lists/items/${item.id}`, { method: 'DELETE' }); if (!response.ok) throw new Error(); row.remove(); window.loadSharedData?.(); if (live) live.textContent = 'List item deleted'; } catch { if (live) live.textContent = 'List item deletion unavailable; retry when connected'; } });
        move.append(edit, remove);
        for (const direction of ['up', 'down']) { const button = document.createElement('button'); button.type = 'button'; button.className = 'module-action'; button.textContent = direction === 'up' ? '↑' : '↓'; button.setAttribute('aria-label', `${direction === 'up' ? 'Move up' : 'Move down'} ${title}`); button.addEventListener('click', async () => { const live = document.querySelector('#live-region'); try { const items = await (await fetch('/api/lists/items')).json(); const item = items.find(value => value.title === title); if (!item) throw new Error('item missing'); const response = await fetch(`/api/lists/items/${item.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }) }); if (!response.ok) throw new Error('move failed'); if (live) live.textContent = `List item moved ${direction}`; } catch { if (live) live.textContent = 'List order unavailable; retry when connected'; } }); move.append(button); }
        row.append(move);
      }
      row.dataset.actionReady = 'true';
    });
  };
  window.__jdRegisterEnhancer(enhance);
})();
