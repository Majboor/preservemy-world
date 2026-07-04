const CACHE_NAME = "preserve-flight-react-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([
      "./",
      "./index.html",
      "./scene-manifest.json",
      "./manifest.webmanifest",
      "./app-icon.png",
      "./f16.glb",
      "./loader-point-cloud.json",
      "./trajectory.json",
      "./sfx/ui-hover.ogg",
      "./sfx/ui-click.ogg",
      "./sfx/ui-open.ogg",
      "./sfx/ui-close.ogg",
      "./sfx/collect.ogg",
      "./sfx/collision.ogg",
      "./sfx/boundary.ogg",
      "./sfx/entry.ogg",
      "./sfx/error.ogg",
      "./sfx/engine-loop.ogg",
      "./sfx/boost-loop.ogg",
      "./sfx/ui-hover.mp3",
      "./sfx/ui-click.mp3",
      "./sfx/ui-open.mp3",
      "./sfx/ui-close.mp3",
      "./sfx/collect.mp3",
      "./sfx/collision.mp3",
      "./sfx/boundary.mp3",
      "./sfx/entry.mp3",
      "./sfx/error.mp3",
      "./sfx/engine-loop.mp3",
      "./sfx/boost-loop.mp3"
    ]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type === "opaque") return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});
