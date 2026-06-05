const CACHE='playback-cifras-v12';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./logo.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE && !key.includes('drive-files')).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const url = new URL(event.request.url);
  if(url.origin !== location.origin) return;

  if(url.pathname.endsWith('/config.js')){
    event.respondWith(fetch(event.request, {cache:'no-store'}));
    return;
  }

  // Network-first evita ficar preso em versões antigas do app, mas mantém fallback offline.
  event.respondWith(
    fetch(event.request, {cache:'no-store'})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request, copy)).catch(()=>{});
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
