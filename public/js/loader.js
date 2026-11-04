// Feature loader. Every feature owns a script (and optionally a stylesheet) in /features; the global theme
// stylesheets live in /css. The order below is the CSS cascade order. extras.js must load first (shared persisted
// store); the other scripts are independent and order-insensitive.
(() => {
  const ASSETS = [
    '/features/extras.js',
    '/css/theme.css',
    '/features/shell.js',
    '/features/settings.css', '/features/settings.js',
    '/features/calendar-views.css', '/features/calendar-views.js',
    '/features/holidays.js',
    '/features/tasks-plus.css', '/features/tasks-plus.js',
    '/features/treasures.css', '/features/treasures.js',
    '/features/meals-plus.css', '/features/meals-plus.js',
    '/features/recipes-kids.js',
    '/features/lists-plus.css', '/features/lists-plus.js',
    '/features/photo-frame.css', '/features/photo-frame.js',
    '/features/child-lock.css', '/features/child-lock.js',
    '/features/profiles-plus.css', '/features/profiles-plus.js',
    '/features/theme-extras.css', '/features/theme-extras.js',
    '/css/controls.css',
    '/css/mobile.css',
    '/css/dark.css'
  ];
  const add = href => {
    if (href.endsWith('.css')) { const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = href; document.head.append(style); return Promise.resolve(); }
    return new Promise(resolve => { const script = document.createElement('script'); script.src = href; script.onload = script.onerror = resolve; document.head.append(script); });
  };
  add('/css/tokens.css');
  (async () => { await add(ASSETS[0]); await Promise.all(ASSETS.slice(1).map(add)); })();
})();
