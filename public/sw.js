const CACHE='jd-planning-shell-v38';
const SHELL=['/index.html','/css/base.css','/js/app.js','/js/offline-ui.js','/js/navigation.js','/js/optional.js','/js/today.js','/js/module-actions.js','/js/provider-ui.js','/js/ownership-ui.js','/js/enhancements.js','/js/calendar-ui.js','/js/density-ui.js','/js/wizard-ui.js','/js/calendar-week-ui.js','/js/moon-ui.js','/js/loader.js','/features/calendar-views.css','/features/calendar-views.js','/features/child-lock.css','/features/child-lock.js','/features/extras.js','/features/holidays.js','/features/lists-plus.css','/features/lists-plus.js','/features/meals-plus.css','/features/meals-plus.js','/features/recipes-kids.js','/css/mobile.css','/features/photo-frame.css','/features/photo-frame.js','/features/profiles-plus.css','/features/profiles-plus.js','/features/settings.css','/features/settings.js','/features/tasks-plus.css','/features/tasks-plus.js','/css/tokens.css','/css/theme.css','/features/theme-extras.css','/features/theme-extras.js','/features/shell.js','/assets/fonts/Nunito-Variable.ttf','/features/treasures.css','/features/treasures.js','/js/members-ui.js','/js/routines-ui.js','/js/school-ui.js','/js/i18n-ui.js','/manifest.webmanifest','/css/brand.css','/css/controls.css','/css/dark.css','/assets/brand/dulli-logo-horizontal-light.svg','/assets/brand/dulli-logo-symbol.svg','/assets/brand/dulli-app-icon-192.png'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const isNavigation=event.request.mode==='navigate'||event.request.destination==='document';
  const isShellAsset=SHELL.some(path=>event.request.url.endsWith(path));
  if(isNavigation||isShellAsset){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('/index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
