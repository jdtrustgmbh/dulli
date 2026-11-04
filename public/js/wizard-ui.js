(async () => {
  if (localStorage.getItem('jd-activated')) return;
  // The flag above is per device. A household that already has a name or members is set up, whatever device or installed app opens it.
  try {
    const response = await fetch('/api/household/demo');
    if (response.ok) {
      const data = await response.json();
      if (data?.name || data?.members?.length) { localStorage.setItem('jd-activated', 'true'); return; }
    }
  } catch {}
  const live = () => document.querySelector('#live-region');
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let needsPassword = false;

  let configuredProviders = [];
  try { const response = await fetch('/api/auth/me'); if (response.ok) { const data = await response.json(); needsPassword = Boolean(data.needsPassword); } } catch {}
  try { const providers = await (await fetch('/api/providers')).json(); configuredProviders = providers.filter(provider => provider.configured && ['google', 'outlook'].includes(provider.id)); } catch {}
  const steps = [...(needsPassword ? ['account'] : []), 'household', 'invite', 'calendar', 'item'];
  let step = localStorage.getItem('jd-wizard-step') || steps[0];
  if (!steps.includes(step)) step = steps[0];

  const dialog = document.createElement('dialog');
  dialog.id = 'wizard-dialog';
  document.body.append(dialog);

  const finish = message => {
    localStorage.setItem('jd-activated', 'true');
    localStorage.removeItem('jd-wizard-step');
    dialog.close();
    dialog.remove();
    if (live()) live().textContent = message;
    window.updateGreeting?.();
    window.loadSharedData?.();
    window.updateAttentionBanner?.();
    window.renderAvatars?.();
  };

  const goTo = next => {
    if (steps.includes(next)) { step = next; localStorage.setItem('jd-wizard-step', step); render(); return; }
    finish('Household ready');
  };

  const stepMeta = {
    account: { title: 'Secure your account', body: 'Set a password, add a photo, and choose your language.' },
    household: { title: 'Name your household', body: 'Tell us who you are and what to call your household. You can change both later.' },
    invite: { title: 'Add a participant', body: 'Add an adult or a child to your household. More can join later from Family.' },
    calendar: { title: 'Bring in a calendar', body: 'Connect Google, CalDAV or an ICS link now to see everything in one place, or add one event by hand. You can connect more later from More.' },
    item: { title: 'Add one thing to do', body: 'A task or a list item - whatever is on your mind right now.' },
  };

  const stepLabelFor = index => window.jdLanguage?.() === 'de' ? `Schritt ${index + 1} von ${steps.length}` : `Step ${index + 1} of ${steps.length}`;
  const syncStepLabel = () => { const eyebrow = dialog.querySelector('.eyebrow'); if (eyebrow) eyebrow.textContent = stepLabelFor(steps.indexOf(step)); };
  if (window.__jdRegisterEnhancer) window.__jdRegisterEnhancer(syncStepLabel); else window.addEventListener('DOMContentLoaded', syncStepLabel);

  function render() {
    const index = steps.indexOf(step);
    const meta = stepMeta[step];
    const stepLabel = stepLabelFor(index);
    dialog.innerHTML = `
      <form method="dialog" class="wizard-form">
        <button type="button" class="close" data-wizard-skip-all aria-label="Close">×</button>
        <p class="eyebrow">${stepLabel}</p>
        <h2>${meta.title}</h2>
        <p class="muted">${meta.body}</p>
        <div class="wizard-step-body"></div>
        <div class="inline-actions wizard-actions">
          ${index > 0 ? '<button type="button" class="outline-button" data-wizard-back>Back</button>' : ''}
          <button type="button" class="outline-button" data-wizard-skip>Skip</button>
        </div>
      </form>`;
    dialog.querySelector('form').addEventListener('submit', e => e.preventDefault());
    dialog.querySelector('[data-wizard-skip-all]').addEventListener('click', () => finish('Household ready'));
    dialog.querySelector('[data-wizard-skip]').addEventListener('click', () => goTo(steps[index + 1]));
    dialog.querySelector('[data-wizard-back]')?.addEventListener('click', () => goTo(steps[index - 1]));
    renderStepBody(dialog.querySelector('.wizard-step-body'), () => goTo(steps[index + 1]));
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('input, select')?.focus();
  }

  function renderStepBody(host, advance) {
    if (step === 'account') {
      host.innerHTML = '<label for="wizard-password">Password</label><input id="wizard-password" type="password" minlength="8" placeholder="At least 8 characters"><label for="wizard-password-confirm">Confirm password</label><input id="wizard-password-confirm" type="password" minlength="8"><label for="wizard-photo-url">Photo URL (optional)</label><input id="wizard-photo-url" type="url" placeholder="https://example.com/photo.jpg"><label for="wizard-language">Language</label><select id="wizard-language"><option value="de">Deutsch</option><option value="en">English</option></select><p class="muted wizard-error" data-i18n-skip hidden></p><button type="button" class="primary-button" data-wizard-continue>Continue</button>';
      host.querySelector('#wizard-language').value = window.jdLanguage?.() ?? 'de';
      host.querySelector('[data-wizard-continue]').addEventListener('click', async () => {
        const errorEl = host.querySelector('.wizard-error');
        const password = host.querySelector('#wizard-password').value;
        const confirm = host.querySelector('#wizard-password-confirm').value;
        const photoUrl = host.querySelector('#wizard-photo-url').value.trim();
        const language = host.querySelector('#wizard-language').value;
        if (password || confirm) {
          if (password.length < 8) { errorEl.textContent = 'Password needs at least 8 characters'; errorEl.hidden = false; return; }
          if (password !== confirm) { errorEl.textContent = 'Passwords do not match'; errorEl.hidden = false; return; }
          try {
            const response = await fetch('/api/auth/set-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
            if (!response.ok) { errorEl.textContent = 'Could not save password; retry when connected'; errorEl.hidden = false; return; }
          } catch { errorEl.textContent = 'Could not save password; retry when connected'; errorEl.hidden = false; return; }
        }
        try { if (photoUrl) await fetch('/api/household/demo/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: photoUrl }) }); } catch {}
        const select = document.querySelector('#language-select');
        if (select) { select.value = language; select.dispatchEvent(new Event('change')); } else { localStorage.setItem('jd-language', language); window.jdTranslate?.(); }
        advance();
      });
      return;
    }
    if (step === 'household') {
      host.innerHTML = '<label for="wizard-your-name">Your name</label><input id="wizard-your-name" maxlength="60" placeholder="e.g. Jordan"><label for="wizard-household-name">Household name</label><input id="wizard-household-name" maxlength="60" placeholder="e.g. The Johnson family"><button type="button" class="primary-button" data-wizard-continue>Continue</button>';
      host.querySelector('[data-wizard-continue]').addEventListener('click', async () => {
        const yourName = host.querySelector('#wizard-your-name').value.trim();
        const householdName = host.querySelector('#wizard-household-name').value.trim();
        try { if (yourName) await fetch('/api/household/demo/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: yourName, role: 'adult' }) }); } catch {}
        try { if (householdName) await fetch('/api/household/demo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: householdName }) }); } catch {}
        window.updateGreeting?.();
        advance();
      });
      return;
    }
    if (step === 'invite') {
      const added = [];
      const renderMembersBody = () => {
        host.innerHTML = `<label for="wizard-invite-name">Name</label><input id="wizard-invite-name" maxlength="60" placeholder="e.g. Alex"><label for="wizard-invite-role">Role</label><select id="wizard-invite-role"><option value="adult">Adult</option><option value="child">Child</option></select><button type="button" class="outline-button" data-wizard-add>Add</button>${added.length ? `<p class="muted wizard-added-list" data-i18n-skip>${added.join(', ')}</p>` : ''}<button type="button" class="primary-button" data-wizard-continue>Continue</button>`;
        host.querySelector('[data-wizard-add]').addEventListener('click', async () => {
          const nameInput = host.querySelector('#wizard-invite-name');
          const name = nameInput.value.trim();
          const role = host.querySelector('#wizard-invite-role').value;
          if (!name) { nameInput.focus(); return; }
          try {
            await fetch('/api/household/demo/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, role }) });
            added.push(name);
            if (live()) live().textContent = `${name} added`;
          } catch { if (live()) live().textContent = 'Could not save; retry when connected'; }
          renderMembersBody();
          host.querySelector('#wizard-invite-name')?.focus();
        });
        host.querySelector('[data-wizard-continue]').addEventListener('click', () => advance());
      };
      renderMembersBody();
      return;
    }
    if (step === 'calendar') {
      const providerButtons = configuredProviders.map(provider => `<a class="primary-button" href="/api/providers/${esc(provider.id)}/connect" data-i18n-skip>Connect ${esc(provider.label ?? provider.id)}</a>`).join('');
      host.innerHTML = `<div class="inline-actions">${providerButtons}<button type="button" class="outline-button" data-wizard-caldav>Connect CalDAV calendar</button><button type="button" class="outline-button" data-wizard-ics>Connect ICS calendar</button><button type="button" class="outline-button" data-wizard-event>Add an event</button></div><div class="wizard-substep"></div>`;
      host.querySelector('[data-wizard-caldav]')?.addEventListener('click', async () => { if (await window.jdConnectCaldav?.()) advance(); });
      host.querySelector('[data-wizard-ics]')?.addEventListener('click', async () => {
        const url = window.prompt(window.jdT ? window.jdT('Paste the ICS calendar URL') : 'Paste the ICS calendar URL');
        if (!url?.trim()) return;
        try { const response = await fetch('/api/providers/ics/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) }); const data = await response.json(); if (live()) live().textContent = response.ok ? `ics connected · ${data.count} events imported` : 'Calendar could not be connected'; } catch { if (live()) live().textContent = 'Calendar could not be connected'; }
        advance();
      });
      host.querySelector('[data-wizard-event]').addEventListener('click', () => {
        const sub = host.querySelector('.wizard-substep');
        sub.innerHTML = '<label for="wizard-event-title">Event title</label><input id="wizard-event-title" maxlength="100" placeholder="e.g. Dentist appointment"><label for="wizard-event-time">Date and time</label><input id="wizard-event-time" type="datetime-local"><button type="button" class="primary-button" data-wizard-event-save>Save event</button>';
        sub.querySelector('[data-wizard-event-save]').addEventListener('click', async () => {
          const title = sub.querySelector('#wizard-event-title').value.trim();
          const startsAt = sub.querySelector('#wizard-event-time').value;
          if (!title || !startsAt) return advance();
          try { await fetch('/api/calendar/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, startsAt: new Date(startsAt).toISOString(), owner: 'Shared' }) }); if (live()) live().textContent = 'Calendar event added'; } catch { if (live()) live().textContent = 'Calendar event could not be saved'; }
          advance();
        });
      });
      return;
    }
    if (step === 'item') {
      host.innerHTML = '<label for="wizard-item-input">What needs doing?</label><input id="wizard-item-input" maxlength="100" placeholder="e.g. Buy milk"><div class="capture-types" role="group" aria-label="Capture type"><button type="button" class="type active" data-wizard-type="Task">Task</button><button type="button" class="type" data-wizard-type="List item">List item</button></div><button type="button" class="primary-button" data-wizard-continue>Add</button>';
      let type = 'Task';
      host.querySelectorAll('[data-wizard-type]').forEach(button => button.addEventListener('click', () => { type = button.dataset.wizardType; host.querySelectorAll('[data-wizard-type]').forEach(other => other.classList.toggle('active', other === button)); }));
      host.querySelector('[data-wizard-continue]').addEventListener('click', async () => {
        const value = host.querySelector('#wizard-item-input').value.trim();
        if (!value) return advance();
        try { await fetch('/api/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value, type }) }); if (live()) live().textContent = `${type} added to household`; } catch { if (live()) live().textContent = `${type} saved locally; sync pending`; }
        advance();
      });
    }
  }

  render();
})();
