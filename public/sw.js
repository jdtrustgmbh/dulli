const CACHE='jd-planning-shell-v51';
const SHELL=['/index.html','/dulli.css','/dulli.js','/js/app.js','/js/offline-ui.js','/assets/fonts/Nunito-Variable.ttf','/manifest.webmanifest','/assets/brand/dulli-logo-horizontal-light.svg','/assets/brand/dulli-logo-symbol.svg','/assets/brand/dulli-app-icon-192.png'];
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
