// Language switch (DE/EN) for the public pages (login and invitation pages). The pages are written in German;
// this maps whole German text nodes/attributes to English. Same preference key as the app (jd-language).
(() => {
  const EN = {
    // shared
    'Anmelden': 'Sign in', 'E-Mail': 'Email', 'Passwort': 'Password',
    // login / join
    'Melde dich an, um dein Dashboard zu sehen.': 'Sign in to see your dashboard.',
    'Einladung annehmen': 'Accept invitation', 'Lege dein Konto an, um den gemeinsamen Haushalt zu nutzen.': 'Create your account to join the shared household.',
    'Einladungscode': 'Invitation code', 'Passwort (mindestens 8 Zeichen)': 'Password (at least 8 characters)', 'Konto anlegen': 'Create account',
    'Schon ein Konto? Anmelden': 'Already have an account? Sign in',
    'Konto anlegen': 'Create account', 'Lege dein Konto an und richte deinen eigenen Familienplaner ein.': 'Create your account and set up your own family planner.',
    'Dieser Link ist ungültig.': 'This link is not valid.', 'Über diesen Link können sich keine weiteren Familien anmelden.': 'No more families can sign up through this link.', 'Die Anmeldung ist nicht freigeschaltet.': 'Signing up is not enabled.',
    'Mit dem Anlegen des Kontos stimmst du den': 'By creating the account you agree to the', 'Nutzungsbedingungen': 'Terms of Use', 'Datenschutz': 'Privacy', 'zu. Hinweise zur Datenverarbeitung:': '. Information on data processing:',
    '@title:Dulli · Konto anlegen': 'Dulli · Create account',
    'E-Mail oder Passwort ist falsch.': 'Email or password is incorrect.', 'Anmeldung gerade nicht möglich. Erneut versuchen.': 'Sign-in is not possible right now. Please try again.',
    'Der Einladungscode ist ungültig oder abgelaufen.': 'The invitation code is invalid or has expired.', 'Diese Einladung gilt für eine andere E-Mail-Adresse.': 'This invitation is for a different email address.',
    'Für diese E-Mail gibt es schon ein Konto.': 'An account with this email already exists.', 'Bitte eine gültige E-Mail-Adresse eingeben.': 'Please enter a valid email address.',
    'Das Passwort braucht mindestens 8 Zeichen.': 'The password needs at least 8 characters.', 'Zu viele Versuche. Bitte später erneut versuchen.': 'Too many attempts. Please try again later.',
    'Das hat nicht geklappt. Erneut versuchen.': 'That did not work. Please try again.', 'Gerade nicht möglich. Erneut versuchen.': 'Not possible right now. Please try again.',
    '@title:Dulli · Anmelden': 'Dulli · Sign in', '@title:Dulli · Einladung annehmen': 'Dulli · Accept invitation'
  };
  const stored = (() => { try { return localStorage.getItem('jd-language'); } catch { return null; } })();
  let lang = stored || (navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en');
  const text = new WeakMap(); const attrs = new WeakMap();
  const ATTRS = ['alt', 'aria-label', 'title', 'placeholder', 'data-monthly', 'data-yearly'];
  window.jdPT = value => (lang === 'en' ? EN[value] ?? value : value);
  window.jdPLang = () => lang;
  const translateText = node => {
    if (!text.has(node)) text.set(node, node.nodeValue);
    const source = text.get(node); const trimmed = source.replace(/\s+/g, ' ').trim();
    const target = lang === 'en' && EN[trimmed] ? source.replace(source.trim(), EN[trimmed]) : source;
    if (node.nodeValue !== target) node.nodeValue = target;
  };
  const apply = () => {
    document.documentElement.lang = lang;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: node => (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName) || node.parentElement?.closest('#jd-public-lang')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    while (walker.nextNode()) translateText(walker.currentNode);
    document.querySelectorAll(ATTRS.map(name => `[${name}]`).join(',')).forEach(element => {
      if (!attrs.has(element)) attrs.set(element, {}); const cache = attrs.get(element);
      for (const name of ATTRS) { if (!element.hasAttribute(name)) continue; if (!(name in cache)) cache[name] = element.getAttribute(name); const value = lang === 'en' ? EN[`@${cache[name]}`] ?? cache[name] : cache[name]; if (element.getAttribute(name) !== value) element.setAttribute(name, value); }
    });
    if (!window.__jdTitle) window.__jdTitle = document.title; document.title = lang === 'en' ? EN[`@title:${window.__jdTitle}`] ?? window.__jdTitle : window.__jdTitle;
    const meta = document.querySelector('meta[name=description]'); if (meta) { if (!meta.dataset.de) meta.dataset.de = meta.content; meta.content = lang === 'en' ? EN[`@desc:${meta.dataset.de}`] ?? meta.dataset.de : meta.dataset.de; }
    const button = document.querySelector('#jd-public-lang button'); if (button) button.textContent = lang === 'en' ? 'Deutsch' : 'English';
  };
  const mount = () => {
    const box = document.createElement('div'); box.id = 'jd-public-lang';
    box.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:60';
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', 'Language / Sprache');
    button.style.cssText = 'min-height:36px;padding:6px 14px;border-radius:999px;border:1px solid var(--line,#d5dde6);background:var(--paper,#fff);color:var(--ink,#042F57);font:600 .85rem inherit;cursor:pointer;box-shadow:0 2px 8px rgba(4,47,87,.15)';
    button.addEventListener('click', () => { lang = lang === 'en' ? 'de' : 'en'; try { localStorage.setItem('jd-language', lang); } catch { /* ignore */ } apply(); });
    box.append(button); document.body.append(box); apply();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
  window.jdPublicApply = apply;
})();
