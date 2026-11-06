(() => {
  const live = document.querySelector('#live-region');
  const esc = value => String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const T = text => (window.jdT ? window.jdT(text) : text);
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  let panel; let dialog; let entries = []; let childNames = []; let childrenReady = Promise.resolve();

  // Every subject has its own default colour. The match is on the subject name without brackets, so
  // "Mathe (Differenzierung)" is coloured like "Mathe"; unknown subjects get a stable colour from their name.
  const SUBJECT_COLORS = [
    [['mathe', 'math'], '#e5484d'], [['deutsch', 'german'], '#a0522d'], [['englisch', 'english'], '#22b8cf'], [['franz', 'french'], '#3b82f6'],
    [['spanisch', 'spanish'], '#f08c1a'], [['latein', 'latin'], '#8d6e63'], [['physik', 'physics'], '#d6336c'], [['chemie', 'chemistry'], '#82c91e'],
    [['bio'], '#2f9e44'], [['geschichte', 'history'], '#5f3dc4'], [['geo', 'erdkunde'], '#b08968'], [['sport'], '#f76707'], [['musik', 'music'], '#fab005'],
    [['kunst'], '#ae3ec9'], [['ethik', 'religion', 'reli'], '#748ffc'], [['wirtschaft'], '#12b886'], [['nwt', 'natur'], '#66a80f'],
    [['informatik', 'computer'], '#339af0'], [['klassenlehrer'], '#868e96'], [['theater'], '#ff8787']
  ];
  const FALLBACK = ['#4c6ef5', '#e8590c', '#0ca678', '#c2255c', '#7048e8', '#1098ad', '#f59f00', '#5c940d'];
  const subjectKey = title => String(title ?? '').replace(/\(.*?\)/g, '').trim().toLowerCase();
  const subjectColor = title => {
    const key = subjectKey(title);
    const hit = SUBJECT_COLORS.find(([words]) => words.some(word => key.includes(word)));
    if (hit) return hit[1];
    let hash = 0; for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return FALLBACK[hash % FALLBACK.length];
  };
  window.jdSubjectColor = subjectColor;
  const colorOf = item => item.color || subjectColor(item.title);

  const pencil = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

  // One timetable per child: tabs on top, the grid shows only the chosen child's lessons. The choice is remembered per device.
  const STORE = 'jd-school-child';
  let selected = (() => { try { return localStorage.getItem(STORE) || ''; } catch { return ''; } })();
  const kids = () => [...new Set([...childNames, ...entries.map(item => item.child)])];
  const dot = name => esc(window.jdMemberColor ? window.jdMemberColor(name) : '#2b8c87');

  function draw() {
    const names = kids();
    if (!names.includes(selected)) selected = names.find(name => entries.some(item => item.child === name)) || names[0] || '';
    panel.querySelector('.jd-school-tabs').innerHTML = names.length > 1 ? names.map(name => `<button type="button" role="tab" class="jd-school-tab" data-school-child="${esc(name)}" aria-selected="${name === selected}"><i style="background:${dot(name)}"></i><span data-i18n-skip>${esc(name)}</span></button>`).join('') : '';
    const mine = entries.filter(item => item.child === selected);
    panel.querySelector('.school-grid').innerHTML = DAYS.map(day => `<div class="school-day"><strong class="jd-day-head">${day}</strong>${mine.filter(item => item.weekday === day).map(item => `<article style="--c:${esc(colorOf(item))}"><b data-i18n-skip>${esc(item.title)}</b><small>${esc(item.startsAt)}${item.room ? ` · ${esc(item.room)}` : ''}</small><button type="button" class="jd-lesson-edit" data-school-edit="${esc(item.id)}" aria-label="${esc(T('Edit lesson'))}" title="${esc(T('Edit lesson'))}">${pencil}</button></article>`).join('') || '<span class="muted">No lessons</span>'}</div>`).join('');
    panel.querySelectorAll('[data-school-edit]').forEach(button => button.addEventListener('click', () => openEditor(entries.find(item => item.id === button.dataset.schoolEdit))));
    panel.querySelectorAll('[data-school-child]').forEach(button => button.addEventListener('click', () => { selected = button.dataset.schoolChild; try { localStorage.setItem(STORE, selected); } catch { /* private mode */ } draw(); }));
  }

  async function render() {
    entries = await (await fetch('/api/school')).json();
    await childrenReady;
    draw();
  }

  const putEntry = (item, patch) => fetch(`/api/school/${encodeURIComponent(item.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ child: item.child, weekday: item.weekday, title: item.title, startsAt: item.startsAt, room: item.room ?? '', recurring: true, color: item.color ?? '', ...patch }) });

  // One dialog serves both: with an entry it edits (and can delete) that lesson, without one it adds new lessons
  // and stays open after saving, keeping child, weekday and time, since entering a whole day in a row is the common flow.
  function openEditor(entry) {
    const adding = !entry;
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.className = 'jd-lesson-dialog';
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      document.body.append(dialog);
    }
    const options = list => list.map(name => `<option>${esc(name)}</option>`).join('');
    const children = adding ? (childNames.length ? childNames : ['Household']) : (childNames.includes(entry.child) ? childNames : [entry.child, ...childNames]);
    dialog.innerHTML = `<form method="dialog" class="jd-lesson-form"><button type="button" class="close" data-close aria-label="${esc(T('Close'))}">×</button><p class="eyebrow">${esc(T('SCHOOL & TIMETABLE'))}</p><h2>${esc(T(adding ? 'Add lesson' : 'Edit lesson'))}</h2>
      <label>${esc(T('Child'))}<select name="child">${options(children)}</select></label>
      <label>${esc(T('Weekday'))}<select name="weekday">${DAYS.map(day => `<option value="${day}">${esc(T(day))}</option>`).join('')}</select></label>
      <label>${esc(T('Subject'))}<input name="title" required maxlength="80" placeholder="${esc(T('Maths'))}"></label>
      <label>${esc(T('Time'))}<input name="startsAt" type="time" required></label>
      <label>${esc(T('Room / teacher'))}<input name="room" maxlength="80" placeholder="${esc(T('Optional'))}"></label>
      <div class="jd-lesson-color"><label for="jd-lesson-color-input">${esc(T('Color'))}</label><input id="jd-lesson-color-input" name="color" type="color"><button type="button" class="jd-btn" data-color-default>${esc(T('Default color'))}</button></div>
      ${adding ? '' : `<label class="jd-lesson-all"><input type="checkbox" name="all" checked><span>${esc(T('Use this color for all lessons of this subject'))}</span></label>`}
      <div class="inline-actions"><button class="primary-button" type="submit">${esc(T(adding ? 'Add lesson' : 'Save'))}</button>${adding ? '' : `<button type="button" class="jd-btn danger" data-delete>${esc(T('Delete'))}</button>`}</div></form>`;
    const form = dialog.querySelector('form');
    const start = entry ?? { child: children.includes(selected) ? selected : children[0], weekday: 'Monday', title: '', startsAt: '08:00', room: '', color: '' };
    form.elements.child.value = start.child; form.elements.weekday.value = start.weekday; form.elements.title.value = start.title;
    form.elements.startsAt.value = start.startsAt; form.elements.room.value = start.room ?? '';
    let usesDefault = !start.color; let touched = false;
    form.elements.color.value = colorOf(start);
    // While the colour is the default one, it follows the subject being typed.
    form.elements.title.addEventListener('input', () => { if (usesDefault) form.elements.color.value = subjectColor(form.elements.title.value); });
    form.elements.color.addEventListener('input', () => { usesDefault = false; touched = true; });
    form.querySelector('[data-color-default]').addEventListener('click', () => { usesDefault = true; touched = true; form.elements.color.value = subjectColor(form.elements.title.value); });
    form.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    form.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!window.confirm(T('Delete this lesson?'))) return;
      const response = await fetch(`/api/school/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      if (!response.ok) { live.textContent = T('Lesson could not be deleted'); return; }
      dialog.close(); live.textContent = T('Lesson deleted'); render();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const value = Object.fromEntries(new FormData(form));
      const color = usesDefault ? '' : form.elements.color.value;
      const body = { child: value.child, weekday: value.weekday, title: value.title.trim(), startsAt: value.startsAt, room: value.room.trim(), recurring: true, color };
      if (adding) {
        const response = await fetch('/api/school', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) { live.textContent = T('Lesson could not be saved'); return; }
        live.textContent = T('Lesson added to timetable');
        form.elements.title.value = ''; form.elements.room.value = ''; usesDefault = true; form.elements.color.value = subjectColor('');
        form.elements.title.focus(); render();
        return;
      }
      const response = await putEntry(entry, body);
      if (!response.ok) { live.textContent = T('Lesson could not be updated'); return; }
      if (touched && form.elements.all.checked) {
        const key = subjectKey(value.title);
        for (const other of entries.filter(item => item.id !== entry.id && subjectKey(item.title) === key)) await putEntry(other, { color });
      }
      dialog.close(); live.textContent = T('Lesson updated'); render();
    });
    dialog.showModal();
    form.elements.title.focus();
  }

  window.jdOpenSchool = async () => {
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'card school-panel';
      panel.innerHTML = `<div class="card-heading"><div><p class="eyebrow">SCHOOL & TIMETABLE</p><h2>Weekly timetable</h2></div><button type="button" class="jd-lesson-add" data-school-add aria-label="${esc(T('Add lesson'))}" title="${esc(T('Add lesson'))}">+</button></div><div class="jd-school-tabs" role="tablist"></div><div class="school-grid" aria-live="polite"></div>`;
      document.querySelector('.shell').append(panel);
      childrenReady = fetch('/api/household/demo').then(response => response.json()).then(household => { const roles = household?.memberRoles ?? {}; childNames = household?.members?.filter(name => roles[name] === 'child') ?? []; }).catch(() => {});
      panel.querySelector('[data-school-add]').addEventListener('click', () => openEditor(null));
    }
    panel.hidden = false;
    await render();
  };
})();
